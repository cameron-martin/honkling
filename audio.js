var that;

class Audio {
  constructor() {
    that = this;
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

    this.context = new AudioContext();
    this.context.suspend();

    this.initData();

    this.processedDataLength = 4040;

    this.oldSR = this.context.sampleRate;
    this.newSR = 16000;

    this.srcBufferSize = 1024;
    // with buffer size of 1024, we can the most features of 44032 from original sample rate of 44100
    // once audio of 44100 features is down sampled to 16000 features,
    // resulting number of features is 15953

    this.meydaBufferSize = 512;
    // when audio features are down sampled to SR of 16000, each 30ms window will have size of 480
    // Unfortunately, minimum buffer size that meyda supports is 512.
    // which means that we have to pass in at least 32 ms
    // As a result, 32 ms length of feature is used for each 30 ms window

    this.meydaHopSize = 160;

    this.fallBackAudio =  $('#fallBackAudio');

    this.context = new AudioContext();

    this.initSrcNode();

    this.initDownSampleNode();
  }

  initData() {
    this.originalData = [];
    this.downSampledData = [];
    this.mfcc = [];
  }

  initSrcNode() {
    var successCallback = function (micStream) {
      console.group();
      $('#audioControl').hide();
      console.log('User allowed microphone access.');
      console.log('Initializing AudioNode from MediaStream');
      that.micSource = that.context.createMediaStreamSource(micStream);
      console.log('Setting Meyda Source to Microphone');
      console.groupEnd();
    };

    var errorCallback = function (err) {
      console.group();
      console.log('Initializing microphone has failed. Falling back to default audio file', err);
      that.audioSource = that.context.createMediaElementSource(that.fallBackAudio[0]);
      that.audioSource.connect(that.context.destination); // connect to speaker
      console.groupEnd();
    };

    try {
      navigator.getUserMedia = navigator.webkitGetUserMedia ||
        navigator.getUserMedia || navigator.mediaDevices.getUserMedia;
      var constraints = { video: false, audio: true };

      console.log('Asking for permission...');

      navigator.mediaDevices.getUserMedia(constraints)
        .then(successCallback)
        .catch(errorCallback)
        .finally(function() {
          $('#extractBtn').prop('disabled', false);
        })
    } catch (err) {
      errorCallback(err);
      $('#extractBtn').prop('disabled', false);
    }
  };

  initDownSampleNode() {
    this.downSampleNode = this.context.createScriptProcessor(this.srcBufferSize, 1, 1);

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

    this.downSampledBufferSize = (that.newSR / that.oldSR) * this.srcBufferSize;

    this.downSampleNode.onaudioprocess = function(audioProcessingEvent) {
      var inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      var downSampledData = interpolateArray(inputData, that.downSampledBufferSize);
      that.originalData = that.originalData.concat(Array.from(inputData));
      that.downSampledData = that.downSampledData.concat(downSampledData);
    }
  }

  processAudio() {
    this.initData();

    if (this.micSource) {
      console.log('start recording');

      this.micSource.connect(this.downSampleNode);
      this.context.resume();

      setTimeout(function() {
        console.log('recording has stopped');
        that.context.suspend();
        that.micSource.disconnect(that.downSampleNode);

        that.getMFCC();
      }, 1000);
    } else {
      this.fallBackAudio[0].onpause = function() {
        console.log('audio has stopped');
        that.context.suspend();
        that.audioSource.disconnect(that.downSampleNode);

        that.getMFCC();
      }

      this.audioSource.connect(this.downSampleNode);
      this.context.resume();

      console.log('playing audio');
      this.fallBackAudio[0].play();
    }
  };

  getMFCC() {
    that.printData('original data', this.originalData);
    that.printData('downsampled data', this.downSampledData);

    // Create an empty 30ms stereo buffer at the sample rate of the AudioContext
    let audioSourceBuffer = this.context.createBuffer(1, this.newSR + this.meydaBufferSize, this.newSR);
    let audioSourceData = audioSourceBuffer.getChannelData(0);

    // librosa stft centers data by padding each end with window size / 2 zeros
    for (let i = 0; i < audioSourceBuffer.length; i++) {
      if (i < this.meydaBufferSize/2) {
        audioSourceData[i] = 0;
      } else if (i < this.downSampledData.length + this.meydaBufferSize/2) {
        audioSourceData[i] = this.downSampledData[i-this.meydaBufferSize/2];
      } else {
        audioSourceData[i] = 0;
      }
    }

    // Get an AudioBufferSourceNode.
    // This is the AudioNode to use when we want to play an AudioBuffer
    this.downSampledSource = this.context.createBufferSource();
    this.downSampledSource.buffer = audioSourceBuffer;

    let postProcessing = function(mfcc) {
      if (that.mfcc.length <= that.processedDataLength) {
        that.mfcc = that.mfcc.concat(Array.from(mfcc));
      }
      
      if (that.mfcc.length == that.processedDataLength) {
        that.context.suspend();
        that.meyda.stop();
        that.downSampledSource.disconnect();
        that.downSampledSource.stop();
        console.log('meyda processing completed');
        that.printData('mfcc', that.mfcc);
      }
    }

    this.meyda = Meyda.createMeydaAnalyzer({
      bufferSize: this.meydaBufferSize,
      source: this.downSampledSource,
      audioContext: this.context,
      hopSize: this.meydaHopSize,
      callback: postProcessing,
      sampleRate: this.newSR,
    });

    console.log('start meyda processing');

    this.context.resume();
    this.meyda.start("mfcc");
    this.downSampledSource.start();
  }

  getData() {
    return this.mfcc;
  }

  printData(name, data) {
    console.log(name, data)

    if (data.length == 0) {
      console.log('\tlength is zero');
    } else {
      if (Array.isArray(data[0])) {
        // 2D array
        var temp = data;
        data = [];

        for (var i = 0; i < temp.length; i++) {
          for (var j = 0; j < temp[i].length; j++) {
            data.push(temp[i][j]);
          }
        }
      }
      const arrMin = arr => Math.min(...arr);
      const arrMax = arr => Math.max(...arr);
      const arrAvg = arr => arr.reduce((a,b) => a + b, 0) / arr.length

      console.log('\trange : ( ', arrMin(data), ' ~ ', arrMax(data), ' )');
      console.log('\tmean : ', arrAvg(data))
    }
  }
}