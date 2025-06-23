/**
 * YM2149 Synthesizer Interface
 * High-level interface matching the Arduino implementation
 */

import { YM2149AudioManager } from './ym2149-audio-manager.js';

export class YM2149SynthInterface {
    constructor() {
        this.audioManager = new YM2149AudioManager();
        this.voices = [
            { note: 0, velocity: 0, playing: false },
            { note: 0, velocity: 0, playing: false },
            { note: 0, velocity: 0, playing: false }
        ];
        
        // Synth parameters (matching Arduino implementation)
        this.synthParams = {
            pwmFreq: [0, 0, 0],
            softDetune: [0, 0, 0],
            synthType: [0, 0, 0],
            volumeEnvShape: [0, 0, 0],
            glide: [0, 0, 0],
            vibratoFreq: [0, 0, 0],
            vibratoAmount: [0, 0, 0],
            noiseDelay: [0, 0, 0],
            pitchEnvAmount: [0, 0, 0],
            pitchEnvShape: [0, 0, 0],
            transpose: [64, 64, 64]
        };
        
        // MIDI note to frequency table (A4 = 440Hz)
        this.noteToFreq = [];
        for (let i = 0; i < 128; i++) {
            this.noteToFreq[i] = 440 * Math.pow(2, (i - 69) / 12);
        }
    }
    
    async initialize() {
        await this.audioManager.initialize();
        
        // Set up event handlers
        this.audioManager.onInitialized = (data) => {
            console.log('YM2149 Synth Interface ready');
            this.initializeDefaultSettings();
        };
        
        this.audioManager.onError = (error) => {
            console.error('YM2149 Synth error:', error);
        };
        
        this.audioManager.onStatusUpdate = (status) => {
            // Handle status updates if needed
        };
    }
    
    initializeDefaultSettings() {
        // Initialize mixer (all tones enabled, no noise)
        this.audioManager.setMixer(true, true, true, false, false, false);
        
        // Set default volumes
        for (let i = 0; i < 3; i++) {
            this.audioManager.setVolume(i, 0);
        }
    }
    
    async start() {
        await this.audioManager.start();
    }
    
    stop() {
        this.audioManager.stop();
    }
    
    // MIDI-style interface
    noteOn(channel, note, velocity) {
        if (channel < 0 || channel > 2) return;
        
        const voice = this.voices[channel];
        voice.note = note;
        voice.velocity = velocity;
        voice.playing = true;
        
        // Convert MIDI note to frequency
        const frequency = this.noteToFreq[note];
        
        // Apply transpose
        const transpose = this.synthParams.transpose[channel] - 64;
        const transposedNote = Math.max(0, Math.min(127, note + transpose));
        const finalFrequency = this.noteToFreq[transposedNote];
        
        // Set frequency and volume
        this.audioManager.setFrequency(channel, finalFrequency);
        this.audioManager.setVolume(channel, Math.floor(velocity / 8)); // Convert 0-127 to 0-15
        
        console.log(`Note ON: Channel ${channel}, Note ${note}, Velocity ${velocity}, Freq ${finalFrequency.toFixed(2)}Hz`);
    }
    
    noteOff(channel, note) {
        if (channel < 0 || channel > 2) return;
        
        const voice = this.voices[channel];
        if (voice.playing && voice.note === note) {
            voice.playing = false;
            this.audioManager.setVolume(channel, 0);
            console.log(`Note OFF: Channel ${channel}, Note ${note}`);
        }
    }
    
    // Control Change interface (matching Arduino CC map)
    controlChange(channel, cc, value) {
        if (channel < 0 || channel > 2) return;
        
        switch (cc) {
            case 1: // PWM Frequency
                this.setPwmFreq(channel, value);
                break;
            case 2: // Soft Detune
                this.setSoftDetune(channel, value);
                break;
            case 3: // Synth Type
                this.setSynthType(channel, value);
                break;
            case 4: // Volume Envelope Shape
                this.setVolumeEnvShape(channel, value);
                break;
            case 5: // Glide
                this.setGlide(channel, value);
                break;
            case 6: // Vibrato Rate
                this.setVibratoFreq(channel, value);
                break;
            case 7: // Vibrato Depth
                this.setVibratoAmount(channel, value);
                break;
            case 8: // Noise Delay
                this.setNoiseDelay(channel, value);
                break;
            case 9: // Pitch Envelope Amount
                this.setPitchEnvAmount(channel, value);
                break;
            case 10: // Pitch Envelope Shape
                this.setPitchEnvShape(channel, value);
                break;
            case 11: // Transpose
                this.setTranspose(channel, value);
                break;
            default:
                console.warn(`Unknown CC: ${cc}`);
        }
    }
    
    // Parameter setters (matching Arduino implementation)
    setPwmFreq(channel, value) {
        this.synthParams.pwmFreq[channel] = value;
        // Implementation depends on synth type
    }
    
    setSoftDetune(channel, value) {
        this.synthParams.softDetune[channel] = value;
        // Apply detune to current frequency if playing
        if (this.voices[channel].playing) {
            const baseFreq = this.noteToFreq[this.voices[channel].note];
            const detune = (value - 64) * 0.1; // Small detune amount
            this.audioManager.setFrequency(channel, baseFreq * Math.pow(2, detune / 1200));
        }
    }
    
    setSynthType(channel, value) {
        this.synthParams.synthType[channel] = value;
        
        // Configure mixer based on synth type
        switch (value) {
            case 0: // Square voice
                this.updateMixerForChannel(channel, true, false);
                break;
            case 7: // Noise
                this.updateMixerForChannel(channel, false, true);
                break;
            default:
                this.updateMixerForChannel(channel, true, false);
        }
    }
    
    setVolumeEnvShape(channel, value) {
        this.synthParams.volumeEnvShape[channel] = value;
        // Envelope implementation would go here
    }
    
    setGlide(channel, value) {
        this.synthParams.glide[channel] = value;
        // Glide implementation would go here
    }
    
    setVibratoFreq(channel, value) {
        this.synthParams.vibratoFreq[channel] = value;
        // Vibrato implementation would go here
    }
    
    setVibratoAmount(channel, value) {
        this.synthParams.vibratoAmount[channel] = value;
        // Vibrato implementation would go here
    }
    
    setNoiseDelay(channel, value) {
        this.synthParams.noiseDelay[channel] = value;
        // Noise delay implementation would go here
    }
    
    setPitchEnvAmount(channel, value) {
        this.synthParams.pitchEnvAmount[channel] = value;
        // Pitch envelope implementation would go here
    }
    
    setPitchEnvShape(channel, value) {
        this.synthParams.pitchEnvShape[channel] = value;
        // Pitch envelope implementation would go here
    }
    
    setTranspose(channel, value) {
        this.synthParams.transpose[channel] = value;
        // Re-trigger current note with new transpose if playing
        if (this.voices[channel].playing) {
            const note = this.voices[channel].note;
            const velocity = this.voices[channel].velocity;
            this.noteOn(channel, note, velocity);
        }
    }
    
    updateMixerForChannel(channel, tone, noise) {
        // Get current mixer state
        const currentMixer = this.audioManager.lastStatus?.mixer || 0;
        
        // Update mixer for this channel
        let newMixer = currentMixer;
        if (tone) {
            newMixer &= ~(1 << channel); // Enable tone
        } else {
            newMixer |= (1 << channel); // Disable tone
        }
        
        if (noise) {
            newMixer &= ~(1 << (channel + 3)); // Enable noise
        } else {
            newMixer |= (1 << (channel + 3)); // Disable noise
        }
        
        this.audioManager.writeRegister(0x07, newMixer);
    }
    
    // Utility methods
    reset() {
        this.audioManager.reset();
        this.voices.forEach(voice => {
            voice.note = 0;
            voice.velocity = 0;
            voice.playing = false;
        });
    }
    
    getStatus() {
        return this.audioManager.getStatus();
    }
    
    destroy() {
        this.audioManager.destroy();
    }
}