import { Socket } from 'net';
import logger from '../utils/logger';
import type { SpeakerIntegration as SpeakerConfig } from '../services/integration.service';

/**
 * Network Speaker Integration
 * Sends audio commands to network-based speakers
 */
export class NetworkSpeakerIntegration {
  /**
   * Trigger speaker alert for new request
   */
  async triggerAlert(speakerConfig: SpeakerConfig): Promise<void> {
    if (!speakerConfig.enabled) {
      logger.debug('Speaker integration is disabled, skipping alert');
      return;
    }

    try {
      // Build command based on sound type
      const command = this.buildAlertCommand(speakerConfig);

      // Send to speaker via network socket
      await this.sendToSpeaker(speakerConfig, command);

      logger.info('Triggered speaker alert', {
        speaker: `${speakerConfig.speakerIp}:${speakerConfig.speakerPort}`,
        soundType: speakerConfig.soundType,
      });
    } catch (error) {
      logger.error('Error triggering speaker alert:', error);
      // Don't throw - we don't want speaker failures to break the request flow
    }
  }

  /**
   * Build alert command based on sound type
   * Format: JSON command sent to speaker
   */
  private buildAlertCommand(config: SpeakerConfig): string {
    const command: {
      action: string;
      soundType: string;
      volume?: number;
      duration?: number;
      customSoundUrl?: string;
    } = {
      action: 'play',
      soundType: config.soundType,
    };

    if (config.volume !== undefined) {
      command.volume = config.volume;
    }

    if (config.duration !== undefined) {
      command.duration = config.duration;
    }

    if (config.soundType === 'custom' && config.customSoundUrl) {
      command.customSoundUrl = config.customSoundUrl;
    }

    return JSON.stringify(command);
  }

  /**
   * Send command to speaker via network socket
   */
  private async sendToSpeaker(config: SpeakerConfig, command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let resolved = false;

      // Set timeout
      socket.setTimeout(3000); // 3 second timeout

      socket.on('connect', () => {
        logger.debug(`Connected to speaker ${config.speakerIp}:${config.speakerPort}`);
        
        // Send command with newline terminator
        socket.write(command + '\n');
        socket.end();
      });

      socket.on('close', () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });

      socket.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        if (!resolved) {
          resolved = true;
          reject(new Error('Speaker connection timeout'));
        }
      });

      // Connect to speaker
      socket.connect(config.speakerPort, config.speakerIp, () => {
        logger.debug(`Connecting to speaker ${config.speakerIp}:${config.speakerPort}`);
      });
    });
  }

  /**
   * Test speaker connection
   */
  async testAlert(speakerConfig: SpeakerConfig): Promise<void> {
    if (!speakerConfig.enabled) {
      throw new Error('Speaker integration is disabled');
    }

    await this.triggerAlert(speakerConfig);
  }
}

export const speakerIntegration = new NetworkSpeakerIntegration();

