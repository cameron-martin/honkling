// TODO :: stream of input is supported generating multiple processor,
// each async response should be able to fine the caller offline processor.

import { transposeFlatten2d } from './util';

export default class OfflineAudioProcessor {
  constructor(config, audioData) {
    this.config = config;
    this.audioData = audioData;

    this.mfccDataLength = 101;
    this.bufferSize = 512;
    // when audio features are down sampled to SR of 16000, each 30ms window will have size of 480
    // Unfortunately, minimum buffer size that meyda supports is 512.
    // which means that we have to pass in at least 32 ms
    // As a result, 32 ms length of feature is used for each 30 ms window
    // TODO :: bufferSize and mfccDataLength can be dynamic based sampleRate & offlineWindowSize

    this.mfcc = [];

    this.audioContext = new OfflineAudioContext(1, config.offlineSampleRate + (this.bufferSize * 20), config.offlineSampleRate);
    // make length of the context long enough that mfcc always gets enough buffers to process

    this.initBufferSourceNode();
    this.initMeydaNode();
  }

  initBufferSourceNode() {
    let audioSourceBuffer = this.audioContext.createBuffer(1, this.audioContext.length, this.config.offlineSampleRate);
    let audioSourceData = audioSourceBuffer.getChannelData(0);

    for (let i = 0; i < audioSourceBuffer.length; i++) {
      if (i < this.audioData.length) {
        audioSourceData[i] = this.audioData[i];
      } else {
        audioSourceData[i] = 0;
      }
    }

    // Get an AudioBufferSourceNode.
    // This is the AudioNode to use when we want to play an AudioBuffer
    this.audioSource = this.audioContext.createBufferSource();
    this.audioSource.buffer = audioSourceBuffer;
  }

  initMeydaNode() {
    let postProcessing = (mfcc) => {
      this.mfcc.push(mfcc);
    }

    var meydaHopSize = this.config.offlineSampleRate / 1000 * this.config.offlineHopSize;

    this.meyda = Meyda.createMeydaAnalyzer({
      bufferSize: this.bufferSize,
      source: this.audioSource,
      audioContext: this.audioContext,
      hopSize: meydaHopSize,
      callback: postProcessing,
      sampleRate: this.config.offlineSampleRate,
    });
  }

  getMFCC() {
    this.meyda.start("mfcc");
    this.audioSource.start();

    return this.audioContext.startRendering().then((renderedBuffer) => {
      this.meyda.stop();
      this.audioSource.disconnect();
      this.mfcc = this.mfcc.slice(0, this.mfccDataLength);
      if (this.mfcc.length < this.mfccDataLength) {
        while (this.mfcc.length != this.mfccDataLength) {
          this.mfcc.push(new Array(40).fill(0));
        }
      }
      this.mfcc = transposeFlatten2d(this.mfcc);

      return this.mfcc;
    });
  }
}
