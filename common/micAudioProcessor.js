import { audioConfig } from './config';

let micProc;

export default class MicAudioProcessor {
  constructor(mediaStream) {
    this.mediaStream = mediaStream;
    micProc = this;

    if (window.hasOwnProperty('webkitAudioContext') &&
    !window.hasOwnProperty('AudioContext')) {
      window.AudioContext = webkitAudioContext;
    }

    if (navigator.hasOwnProperty('webkitGetUserMedia') &&
    !navigator.hasOwnProperty('getUserMedia')) {
      navigator.getUserMedia = webkitGetUserMedia;
      if (!AudioContext.prototype.hasOwnProperty('createScriptProcessor')) {
        AudioContext.prototype.createScriptProcessor = AudioContext.prototype.createJavaScriptNode;
      }
    }

    this.audioContext = new AudioContext();

    this.browserSampleRate = this.audioContext.sampleRate;// 44100
    this.srcBufferSize = 1024;
    // with buffer size of 1024, we can capture 44032 features for original sample rate of 44100
    // once audio of 44100 features is down sampled to 16000 features,
    // resulting number of features is 15953

    this.initDownSampleNode();
    this.data = [];
  }

  start() {
    micProc.micSource = micProc.audioContext.createMediaStreamSource(this.mediaStream);
    micProc.micSource.connect(micProc.downSampleNode);
    micProc.downSampleNode.connect(micProc.audioContext.destination);

    if (micProc.audioContext.state == "suspended") {
      // audio context start suspended on Chrome due to auto play policy
      micProc.audioContext.resume();
    }
  };

  initDownSampleNode() {
    this.downSampleNode = this.audioContext.createScriptProcessor(this.srcBufferSize, 1, 1);
    this.downSampledBufferSize = (audioConfig.offlineSampleRate / this.browserSampleRate) * this.srcBufferSize;

    function interpolateArray(data, fitCount) {
      var linearInterpolate = function (before, after, atPoint) {
        return before + (after - before) * atPoint;
      };

      var newData = new Array();
      var springFactor = new Number((data.length - 1) / (fitCount - 1));
      newData[0] = data[0]; // for new allocation
      for ( var i = 1; i < fitCount - 1; i++) {
        var tmp = i * springFactor;
        var before = new Number(Math.floor(tmp)).toFixed();
        var after = new Number(Math.ceil(tmp)).toFixed();
        var atPoint = tmp - before;
        newData[i] = linearInterpolate(data[before], data[after], atPoint);
      }
      newData[fitCount - 1] = data[data.length - 1]; // for new allocation
      return newData;
    }

    this.downSampleNode.onaudioprocess = function(audioProcessingEvent) {
      var inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      var downSampledData = interpolateArray(inputData, micProc.downSampledBufferSize);
      if (micProc.data.length > audioConfig.offlineSampleRate) {
        micProc.data.splice(0, micProc.downSampledBufferSize);
      }
      micProc.data = micProc.data.concat(downSampledData);
    }
  }

  getData() {
    return this.data;
  }
}
