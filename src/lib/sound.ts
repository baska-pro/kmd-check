export function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    // Modern arpeggio sequence: C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Use a mix of sine and triangle for a modern, soft synth sound
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      
      const startTime = now + i * 0.12; // 120ms delay between notes
      
      // Envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02); // Quick attack
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6); // Long release
      
      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
  } catch (e) {
    // Silently fail if audio is not supported or blocked by browser policy
  }
}
