/**
 * YM2149 AudioWorklet Processor
 * Handles real-time audio generation for the YM2149 synthesizer
 */

import { YM2149Emulator } from './ym2149-emulator.js';

class YM2149WorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        
        // Initialize the YM2149 emulator
        this.emulator = new YM2149Emulator(sampleRate);
        
        // Audio processing state
        this.isActive = true;
        this.bufferUnderruns = 0;
        this.samplesProcessed = 0;
        
        // Performance monitoring
        this.lastPerformanceCheck = 0;
        this.processingTimeSum = 0;
        this.processingTimeCount = 0;
        
        // Message handling
        this.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };
        
        // Send initialization complete message
        this.port.postMessage({
            type: 'initialized',
            sampleRate: sampleRate,
            timestamp: currentTime
        });
        
        console.log(`YM2149 Worklet initialized at ${sampleRate}Hz`);
    }
    
    handleMessage(data) {
        try {
            switch (data.type) {
                case 'writeRegister':
                    this.writeRegister(data.register, data.value);
                    break;
                    
                case 'reset':
                    this.emulator.reset();
                    this.port.postMessage({
                        type: 'resetComplete',
                        timestamp: currentTime
                    });
                    break;
                    
                case 'getStatus':
                    this.sendStatus();
                    break;
                    
                case 'setActive':
                    this.isActive = data.active;
                    break;
                    
                default:
                    console.warn('Unknown message type:', data.type);
            }
        } catch (error) {
            this.port.postMessage({
                type: 'error',
                message: error.message,
                timestamp: currentTime
            });
        }
    }
    
    writeRegister(register, value) {
        if (typeof register !== 'number' || typeof value !== 'number') {
            throw new Error('Register and value must be numbers');
        }
        
        if (register < 0 || register > 15) {
            throw new Error(`Invalid register: ${register}. Must be 0-15`);
        }
        
        if (value < 0 || value > 255) {
            throw new Error(`Invalid value: ${value}. Must be 0-255`);
        }
        
        this.emulator.writeRegister(register, value);
        
        // Send confirmation for critical register writes
        if (register === 0x0D) { // Envelope shape register
            this.port.postMessage({
                type: 'registerWritten',
                register: register,
                value: value,
                timestamp: currentTime
            });
        }
    }
    
    sendStatus() {
        const avgProcessingTime = this.processingTimeCount > 0 
            ? this.processingTimeSum / this.processingTimeCount 
            : 0;
            
        this.port.postMessage({
            type: 'status',
            isActive: this.isActive,
            sampleRate: sampleRate,
            samplesProcessed: this.samplesProcessed,
            bufferUnderruns: this.bufferUnderruns,
            avgProcessingTime: avgProcessingTime,
            timestamp: currentTime
        });
    }
    
    process(inputs, outputs, parameters) {
        const startTime = performance.now();
        
        if (!this.isActive) {
            return true;
        }
        
        const output = outputs[0];
        if (!output || output.length === 0) {
            this.bufferUnderruns++;
            return true;
        }
        
        const numSamples = output[0].length;
        const leftChannel = output[0];
        const rightChannel = output[1] || output[0]; // Fallback to mono if no right channel
        
        try {
            // Generate audio samples
            for (let i = 0; i < numSamples; i++) {
                const sample = this.emulator.generateSample();
                leftChannel[i] = sample;
                rightChannel[i] = sample; // Mono output for now
            }
            
            this.samplesProcessed += numSamples;
            
            // Performance monitoring
            const processingTime = performance.now() - startTime;
            this.processingTimeSum += processingTime;
            this.processingTimeCount++;
            
            // Send periodic status updates
            if (currentTime - this.lastPerformanceCheck > 1.0) {
                this.sendStatus();
                this.lastPerformanceCheck = currentTime;
                
                // Reset performance counters
                this.processingTimeSum = 0;
                this.processingTimeCount = 0;
            }
            
        } catch (error) {
            console.error('Error in YM2149 audio processing:', error);
            this.port.postMessage({
                type: 'error',
                message: `Audio processing error: ${error.message}`,
                timestamp: currentTime
            });
            
            // Fill with silence on error
            leftChannel.fill(0);
            rightChannel.fill(0);
        }
        
        return true;
    }
    
    static get parameterDescriptors() {
        return [
            {
                name: 'masterVolume',
                defaultValue: 0.5,
                minValue: 0,
                maxValue: 1,
                automationRate: 'a-rate'
            }
        ];
    }
}

registerProcessor('ym2149-worklet', YM2149WorkletProcessor);