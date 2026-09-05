export class VoiceDetectionService {
  private isListening: boolean = false;
  private onKeywordDetected?: (keyword: string, confidence: number) => void;

  constructor() {}

  public setCallback(onKeywordDetected: (keyword: string, confidence: number) => void) {
    this.onKeywordDetected = onKeywordDetected;
  }

  public startListening() {
    this.isListening = true;
    console.log('[VOICE] Started listening for emergency keywords');
  }

  public stopListening() {
    this.isListening = false;
    console.log('[VOICE] Stopped listening');
  }

  // Simulates processing audio chunks
  public processAudio(audioData: any) {
    if (!this.isListening) return;
    // Real implementation would pass audioData to a model here.
  }

  // This is used to mock a detection event for Demo Mode
  public simulateKeywordDetection(keyword: string = 'HELP', confidence: number = 0.95) {
    if (this.isListening && this.onKeywordDetected) {
      console.log(`[VOICE] Keyword ${keyword} detected with confidence ${confidence}`);
      this.onKeywordDetected(keyword, confidence);
    }
  }
}

export const voiceService = new VoiceDetectionService();
