class KeywordSpotter {
  constructor(mediaStream) {
    this.micAudioProcessor = new MicAudioProcessor(mediaStream);
    this.model = new SpeechResModel("RES8_NARROW", commands);
  }

  async predict() {
    this.micAudioProcessor.start();
    setInterval(() => {
      let offlineProcessor = new OfflineAudioProcessor(audioConfig, this.micAudioProcessor.getData());
      offlineProcessor.getMFCC().done((mfccData) => {
        const keyword = predictKeyword(mfccData, this.model, commands);

        if(this.onkeyword) {
          this.onkeyword(keyword);
        }
      });
    }, predictionFrequency);
  }
}
