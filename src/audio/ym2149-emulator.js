/**
 * YM2149 Sound Chip Emulator
 * Based on the Arduino YM2149 Synth implementation
 */
export class YM2149Emulator {
    constructor(sampleRate = 44100) {
        this.sampleRate = sampleRate;
        this.clockRate = 2000000; // 2MHz clock
        
        // Initialize registers (16 registers, 0x00-0x0F)
        this.registers = new Uint8Array(16);
        
        // Voice state for 3 channels
        this.voices = [
            { 
                counter: 0, 
                output: 0, 
                period: 0,
                volume: 0,
                envEnabled: false,
                noiseEnabled: false,
                toneEnabled: true
            },
            { 
                counter: 0, 
                output: 0, 
                period: 0,
                volume: 0,
                envEnabled: false,
                noiseEnabled: false,
                toneEnabled: true
            },
            { 
                counter: 0, 
                output: 0, 
                period: 0,
                volume: 0,
                envEnabled: false,
                noiseEnabled: false,
                toneEnabled: true
            }
        ];
        
        // Noise generator
        this.noise = {
            counter: 0,
            output: 0,
            period: 0,
            lfsr: 1 // Linear feedback shift register
        };
        
        // Envelope generator
        this.envelope = {
            counter: 0,
            period: 0,
            shape: 0,
            phase: 0,
            output: 15,
            holding: false,
            attack: false,
            alternate: false,
            continue: false,
            hold: false
        };
        
        // Volume levels (4-bit to linear conversion with logarithmic scaling)
        this.volumeTable = new Float32Array(16);
        for (let i = 0; i < 16; i++) {
            this.volumeTable[i] = i === 0 ? 0 : Math.pow(2, (i - 15) / 2) * 0.5;
        }
        
        // Envelope volume table (256 steps for smooth envelopes)
        this.envelopeTable = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            this.envelopeTable[i] = Math.pow(i / 255, 1.75);
        }
        
        this.reset();
    }
    
    reset() {
        this.registers.fill(0);
        
        this.voices.forEach(voice => {
            voice.counter = 0;
            voice.output = 0;
            voice.period = 1;
            voice.volume = 0;
            voice.envEnabled = false;
            voice.noiseEnabled = false;
            voice.toneEnabled = true;
        });
        
        this.noise.counter = 0;
        this.noise.output = 0;
        this.noise.period = 1;
        this.noise.lfsr = 1;
        
        this.envelope.counter = 0;
        this.envelope.period = 1;
        this.envelope.shape = 0;
        this.envelope.phase = 0;
        this.envelope.output = 15;
        this.envelope.holding = false;
    }
    
    writeRegister(register, value) {
        if (register < 0 || register > 15) {
            throw new Error(`Invalid register: ${register}`);
        }
        
        this.registers[register] = value & 0xFF;
        this.updateInternalState(register);
    }
    
    updateInternalState(register) {
        switch (register) {
            case 0x00: // Channel A frequency low
            case 0x01: // Channel A frequency high
                this.voices[0].period = Math.max(1, (this.registers[0x01] & 0x0F) << 8 | this.registers[0x00]);
                break;
                
            case 0x02: // Channel B frequency low
            case 0x03: // Channel B frequency high
                this.voices[1].period = Math.max(1, (this.registers[0x03] & 0x0F) << 8 | this.registers[0x02]);
                break;
                
            case 0x04: // Channel C frequency low
            case 0x05: // Channel C frequency high
                this.voices[2].period = Math.max(1, (this.registers[0x05] & 0x0F) << 8 | this.registers[0x04]);
                break;
                
            case 0x06: // Noise frequency
                this.noise.period = Math.max(1, (this.registers[0x06] & 0x1F) * 2);
                break;
                
            case 0x07: // Mixer control
                const mixer = this.registers[0x07];
                for (let i = 0; i < 3; i++) {
                    this.voices[i].toneEnabled = !(mixer & (1 << i));
                    this.voices[i].noiseEnabled = !(mixer & (1 << (i + 3)));
                }
                break;
                
            case 0x08: // Channel A volume
            case 0x09: // Channel B volume
            case 0x0A: // Channel C volume
                const channel = register - 0x08;
                const volumeReg = this.registers[register];
                this.voices[channel].volume = volumeReg & 0x0F;
                this.voices[channel].envEnabled = !!(volumeReg & 0x10);
                break;
                
            case 0x0B: // Envelope frequency low
            case 0x0C: // Envelope frequency high
                this.envelope.period = Math.max(1, (this.registers[0x0C] << 8 | this.registers[0x0B]) * 2);
                break;
                
            case 0x0D: // Envelope shape
                const shape = this.registers[0x0D];
                this.envelope.continue = !!(shape & 0x08);
                this.envelope.attack = !!(shape & 0x04);
                this.envelope.alternate = !!(shape & 0x02);
                this.envelope.hold = !!(shape & 0x01);
                
                // Reset envelope
                this.envelope.phase = 0;
                this.envelope.counter = 0;
                this.envelope.holding = false;
                this.envelope.output = this.envelope.attack ? 0 : 15;
                break;
        }
    }
    
    updateNoise() {
        this.noise.counter++;
        if (this.noise.counter >= this.noise.period) {
            this.noise.counter = 0;
            
            // 17-bit LFSR with taps at bits 0 and 3
            const feedback = ((this.noise.lfsr & 1) ^ ((this.noise.lfsr >> 3) & 1)) & 1;
            this.noise.lfsr = ((this.noise.lfsr >> 1) | (feedback << 16)) & 0x1FFFF;
            this.noise.output = this.noise.lfsr & 1;
        }
    }
    
    updateEnvelope() {
        if (!this.envelope.continue && this.envelope.holding) {
            return;
        }
        
        this.envelope.counter++;
        if (this.envelope.counter >= this.envelope.period) {
            this.envelope.counter = 0;
            
            if (!this.envelope.holding) {
                if (this.envelope.attack) {
                    this.envelope.phase++;
                    if (this.envelope.phase >= 32) {
                        this.envelope.phase = 31;
                        if (!this.envelope.continue) {
                            this.envelope.holding = true;
                        } else if (this.envelope.alternate) {
                            this.envelope.attack = false;
                        } else {
                            this.envelope.phase = 0;
                        }
                    }
                } else {
                    this.envelope.phase--;
                    if (this.envelope.phase < 0) {
                        this.envelope.phase = 0;
                        if (!this.envelope.continue) {
                            this.envelope.holding = true;
                        } else if (this.envelope.alternate) {
                            this.envelope.attack = true;
                        } else {
                            this.envelope.phase = 31;
                        }
                    }
                }
                
                this.envelope.output = this.envelope.phase;
            }
        }
    }
    
    generateSample() {
        // Update noise generator
        this.updateNoise();
        
        // Update envelope generator
        this.updateEnvelope();
        
        let mixedOutput = 0;
        
        // Process each voice
        for (let i = 0; i < 3; i++) {
            const voice = this.voices[i];
            
            // Update tone generator
            voice.counter++;
            if (voice.counter >= voice.period) {
                voice.counter = 0;
                voice.output = 1 - voice.output;
            }
            
            // Determine if voice should output
            let voiceEnabled = false;
            if (voice.toneEnabled && voice.output) voiceEnabled = true;
            if (voice.noiseEnabled && this.noise.output) voiceEnabled = true;
            if (!voice.toneEnabled && !voice.noiseEnabled) voiceEnabled = false;
            
            if (voiceEnabled) {
                let volume;
                if (voice.envEnabled) {
                    volume = this.volumeTable[this.envelope.output];
                } else {
                    volume = this.volumeTable[voice.volume];
                }
                mixedOutput += volume;
            }
        }
        
        // Normalize and apply some soft clipping
        mixedOutput = mixedOutput / 3;
        if (mixedOutput > 1) {
            mixedOutput = 1 - Math.exp(-(mixedOutput - 1));
        }
        
        return mixedOutput * 0.3; // Scale down to prevent clipping
    }
    
    // Batch process samples for efficiency
    processSamples(outputBuffer, numSamples) {
        for (let i = 0; i < numSamples; i++) {
            outputBuffer[i] = this.generateSample();
        }
    }
}