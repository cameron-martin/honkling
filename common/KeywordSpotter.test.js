import KeywordSpotter from './KeywordSpotter';

function sleep(timeMs) {
    return new Promise((resolve) => setTimeout(resolve, timeMs))
}

async function createStream(clipName) {
    const audioElement = document.createElement('audio');
    audioElement.controls = true;
    audioElement.src = `/base/honkling-node/test/${clipName}.wav`;
    
    await new Promise((resolve, reject) => {
        audioElement.onloadeddata = resolve;
        audioElement.onerror = () => { reject(audioElement.error); }
    });

    
    return { stream: audioElement.captureStream(), audioElement };
}

describe('KeywordSpotter', () => {
    it('predicts keyword', async () => {
        const { stream, audioElement } = await createStream('off');
    
        const spotter = new KeywordSpotter(stream);
    
        const callback = jasmine.createSpy();
    
        spotter.onkeyword = callback;
        try {
            await sleep(100);
            await spotter.predict();
            
            await sleep(100);
            audioElement.play();
        
            await sleep(1200);
        
            expect(callback.calls.all().map(call => call.args[0])).toEqual(['unknown', 'unknown', 'off']);
        } finally {
            spotter.stop();
        }
    });
});

