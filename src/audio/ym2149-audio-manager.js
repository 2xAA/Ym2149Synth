/**
 * YM2149 Audio Manager
 * Main thread interface for the YM2149 AudioWorklet
 */

export class YM2149AudioManager {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.isInitialized = false;
        this.isPlaying = false;
        
        // Event handlers
        this.onInitialized = null;
        this.onError = null;
        this.onStatusUpdate = null;
        
        // Performance monitoring
        this.lastStatus = null;
    }
    
    async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Check sample rate compatibility
            const supportedRates = [44100, 48000];
            if (!supportedRates.includes(this.audioContext.sampleRate)) {
                console.warn(`Unusual sample rate: ${this.audioContext.sampleRate}Hz. May cause issues.`);
            }
            
            // Load the worklet module
            await this.audioContext.audioWorklet.addModule('/src/audio/ym2149-worklet.js');
            
            // Create the worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'ym2149-worklet', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2], // Stereo output
                processorOptions: {
                    sampleRate: this.audioContext.sampleRate
                }
            });
            
            // Set up message handling
            this.workletNode.port.onmessage = (event) => {
                this.handleWorkletMessage(event.data);
            };
            
            // Connect to audio destination
            this.workletNode.connect(this.audioContext.destination);
            
            console.log('YM2149 Audio Manager initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize YM2149 Audio Manager:', error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }
    
    handleWorkletMessage(data) {
        switch (data.type) {
            case 'initialized':
                this.isInitialized = true;
                console.log(`YM2149 worklet ready at ${data.sampleRate}Hz`);
                if (this.onInitialized) {
                    this.onInitialized(data);
                }
                break;
                
            case 'error':
                console.error('YM2149 worklet error:', data.message);
                if (this.onError) {
                    this.onError(new Error(data.message));
                }
                break;
                
            case 'status':
                this.lastStatus = data;
                if (this.onStatusUpdate) {
                    this.onStatusUpdate(data);
                }
                break;
                
            case 'registerWritten':
                // Handle register write confirmations if needed
                break;
                
            case 'resetComplete':
                console.log('YM2149 reset completed');
                break;
                
            default:
                console.warn('Unknown worklet message type:', data.type);
        }
    }
    
    async start() {
        if (!this.isInitialized) {
            throw new Error('Audio manager not initialized');
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        this.workletNode.port.postMessage({
            type: 'setActive',
            active: true
        });
        
        this.isPlaying = true;
        console.log('YM2149 audio started');
    }
    
    stop() {
        if (!this.isInitialized) {
            return;
        }
        
        this.workletNode.port.postMessage({
            type: 'setActive',
            active: false
        });
        
        this.isPlaying = false;
        console.log('YM2149 audio stopped');
    }
    
    writeRegister(register, value) {
        if (!this.isInitialized) {
            throw new Error('Audio manager not initialized');
        }
        
        if (typeof register !== 'number' || typeof value !== 'number') {
            throw new Error('Register and value must be numbers');
        }
        
        this.workletNode.port.postMessage({
            type: 'writeRegister',
            register: register,
            value: value
        });
    }
    
    reset() {
        if (!this.isInitialized) {
            throw new Error('Audio manager not initialized');
        }
        
        this.workletNode.port.postMessage({
            type: 'reset'
        });
    }
    
    getStatus() {
        if (!this.isInitialized) {
            return null;
        }
        
        this.workletNode.port.postMessage({
            type: 'getStatus'
        });
        
        return this.lastStatus;
    }
    
    // Convenience methods for common operations
    setVolume(channel, volume) {
        if (channel < 0 || channel > 2) {
            throw new Error('Channel must be 0, 1, or 2');
        }
        if (volume < 0 || volume > 15) {
            throw new Error('Volume must be 0-15');
        }
        
        this.writeRegister(0x08 + channel, volume);
    }
    
    setFrequency(channel, frequency) {
        if (channel < 0 || channel > 2) {
            throw new Error('Channel must be 0, 1, or 2');
        }
        
        // Convert frequency to YM2149 period value
        const period = Math.round(125000 / frequency);
        const clampedPeriod = Math.max(1, Math.min(4095, period));
        
        const registerBase = channel * 2;
        this.writeRegister(registerBase, clampedPeriod & 0xFF);
        this.writeRegister(registerBase + 1, (clampedPeriod >> 8) & 0x0F);
    }
    
    setMixer(toneA, toneB, toneC, noiseA, noiseB, noiseC) {
        let mixer = 0;
        if (!toneA) mixer |= 0x01;
        if (!toneB) mixer |= 0x02;
        if (!toneC) mixer |= 0x04;
        if (!noiseA) mixer |= 0x08;
        if (!noiseB) mixer |= 0x10;
        if (!noiseC) mixer |= 0x20;
        
        this.writeRegister(0x07, mixer);
    }
    
    setEnvelopeFrequency(frequency) {
        const period = Math.round(125000 / frequency);
        const clampedPeriod = Math.max(1, Math.min(65535, period));
        
        this.writeRegister(0x0B, clampedPeriod & 0xFF);
        this.writeRegister(0x0C, (clampedPeriod >> 8) & 0xFF);
    }
    
    setEnvelopeShape(shape) {
        this.writeRegister(0x0D, shape & 0x0F);
    }
    
    destroy() {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.isInitialized = false;
        this.isPlaying = false;
        
        console.log('YM2149 Audio Manager destroyed');
    }
}