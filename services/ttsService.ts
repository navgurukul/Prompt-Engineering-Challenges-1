
let synth: SpeechSynthesis | null = null;
let voices: SpeechSynthesisVoice[] = [];

if ('speechSynthesis' in window) {
  synth = window.speechSynthesis;
} else {
  console.warn("Text-to-speech not supported in this browser.");
}

const loadVoices = () => {
  if (synth) {
    voices = synth.getVoices();
  }
};

if (synth) {
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }
}

export const speak = (text: string, lang = 'en-US'): void => {
  if (!synth || !text) {
    return;
  }

  if (synth.speaking) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.pitch = 1;
  utterance.rate = 1;
  utterance.volume = 1;

  const desiredVoice = voices.find(voice => voice.lang === 'en-IN');
  if (desiredVoice) {
    utterance.voice = desiredVoice;
    utterance.lang = 'en-IN';
  }

  synth.speak(utterance);
};

export const cancelSpeech = (): void => {
  if (synth && synth.speaking) {
    synth.cancel();
  }
};
