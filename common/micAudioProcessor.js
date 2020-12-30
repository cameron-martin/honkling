import { audioConfig } from './config';

export default class MicAudioProcessor {
  constructor(mediaStream) {
    this.mediaStream = mediaStream;

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
    this.micSource = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.micSource.connect(this.downSampleNode);
    this.downSampleNode.connect(this.audioContext.destination);

    if (this.audioContext.state == "suspended") {
      // audio context start suspended on Chrome due to auto play policy
      this.audioContext.resume();
    }
  };

  initDownSampleNode() {
    this.downSampleNode = this.audioContext.createScriptProcessor(this.srcBufferSize, 1, 1);
    this.downSampledBufferSize = (audioConfig.offlineSampleRate / this.browserSampleRate) * this.srcBufferSize;

    function interpolateArray(data, fitCount) {
      var linearInterpolate = function (before, after, atPoint) {
        return before + (after - before) * atPoint;
      };

      var newData = [];
      var springFactor = (data.length - 1) / (fitCount - 1);
      newData[0] = data[0]; // for new allocation
      for ( var i = 1; i < fitCount - 1; i++) {
        var tmp = i * springFactor;
        var before = Math.floor(tmp);
        var after = Math.ceil(tmp);
        var atPoint = tmp - before;
        newData[i] = linearInterpolate(data[before], data[after], atPoint);
      }
      newData[fitCount - 1] = data[data.length - 1]; // for new allocation
      return newData;
    }

    this.downSampleNode.onaudioprocess = (audioProcessingEvent) => {
      var inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      var downSampledData = interpolateArray(inputData, this.downSampledBufferSize);
      if (this.data.length > audioConfig.offlineSampleRate) {
        this.data.splice(0, this.downSampledBufferSize);
      }
      this.data = this.data.concat(downSampledData);
    }
  }

  getData() {
    return this.data;
  }
}
