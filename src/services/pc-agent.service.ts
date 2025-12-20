import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../utils/logger';

/**
 * PC Agent Service
 * Handles all communication with PC Agent (Local Network Bridge)
 * PC Agent is the ONLY method for printer communication - scalable and reliable
 */
export class PcAgentService {
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      timeout: 10000, // 10 seconds timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Waiter-Backend/1.0',
      },
      // Retry configuration for better reliability
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });
  }

  /**
   * Send print job to PC Agent
   * PC Agent will handle the actual printer communication
   */
  async sendPrintJob(
    pcAgentIp: string,
    pcAgentPort: number,
    printData: Buffer,
    printerIp?: string,
    printerPort?: number,
  ): Promise<{ status: string; message: string; printerIp?: string; printerPort?: number }> {
    // Validate PC Agent configuration
    this.validatePcAgentConfig(pcAgentIp, pcAgentPort);

    const pcAgentUrl = `http://${pcAgentIp}:${pcAgentPort}/print`;

    try {
      // Convert buffer to base64 for HTTP transmission
      const base64Data = printData.toString('base64');

      const requestBody: {
        text: string;
        format: 'base64';
        printerIp?: string;
        printerPort?: number;
      } = {
        text: base64Data,
        format: 'base64',
      };

      // Add printer IP/Port if provided (PC Agent will use these instead of defaults)
      if (printerIp) {
        requestBody.printerIp = printerIp;
      }
      if (printerPort) {
        requestBody.printerPort = printerPort;
      }

      logger.debug(`Sending print job to PC Agent at ${pcAgentUrl}`, {
        dataLength: printData.length,
        printerIp: printerIp || 'default',
        printerPort: printerPort || 'default',
      });

      const response = await this.httpClient.post(pcAgentUrl, requestBody);

      if (response.status === 200 && response.data?.status === 'DONE') {
        logger.info(`Print job sent successfully via PC Agent`, {
          pcAgent: `${pcAgentIp}:${pcAgentPort}`,
          printer: response.data.printerIp
            ? `${response.data.printerIp}:${response.data.printerPort}`
            : 'default',
        });

        return {
          status: 'DONE',
          message: response.data.message || 'Print job sent successfully',
          printerIp: response.data.printerIp,
          printerPort: response.data.printerPort,
        };
      } else {
        const errorMessage = response.data?.message || 'Unknown error from PC Agent';
        logger.error(`PC Agent returned error status`, {
          status: response.data?.status,
          message: errorMessage,
        });
        throw new Error(`PC Agent error: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = this.handlePcAgentError(error, pcAgentIp, pcAgentPort);
      throw new Error(errorMessage);
    }
  }

  /**
   * Test PC Agent connection (health check)
   * Verifies PC Agent is reachable and responding
   */
  async testConnection(pcAgentIp: string, pcAgentPort: number): Promise<{
    success: boolean;
    message: string;
    data?: {
      status: string;
      service: string;
      version?: string;
      timestamp?: string;
    };
  }> {
    this.validatePcAgentConfig(pcAgentIp, pcAgentPort);

    const healthUrl = `http://${pcAgentIp}:${pcAgentPort}/health`;

    try {
      logger.debug(`Testing PC Agent connection at ${healthUrl}`);

      const response = await this.httpClient.get(healthUrl, {
        timeout: 5000, // 5 seconds for health check
      });

      if (response.status === 200 && response.data?.status === 'ok') {
        logger.info(`PC Agent health check successful`, {
          pcAgent: `${pcAgentIp}:${pcAgentPort}`,
          service: response.data.service,
          version: response.data.version,
        });

        return {
          success: true,
          message: 'PC Agent is reachable and responding',
          data: {
            status: response.data.status,
            service: response.data.service,
            version: response.data.version,
            timestamp: response.data.timestamp,
          },
        };
      } else {
        return {
          success: false,
          message: 'PC Agent responded but with unexpected status',
          data: response.data,
        };
      }
    } catch (error) {
      const errorMessage = this.handlePcAgentError(error, pcAgentIp, pcAgentPort);
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Validate PC Agent configuration
   */
  private validatePcAgentConfig(pcAgentIp: string, pcAgentPort: number): void {
    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(pcAgentIp)) {
      throw new Error(`Invalid PC Agent IP address format: ${pcAgentIp}`);
    }

    // Validate port range
    if (isNaN(pcAgentPort) || pcAgentPort < 1 || pcAgentPort > 65535) {
      throw new Error(`Invalid PC Agent port: ${pcAgentPort}. Port must be between 1 and 65535.`);
    }
  }

  /**
   * Handle PC Agent errors with user-friendly messages
   */
  private handlePcAgentError(error: unknown, pcAgentIp: string, pcAgentPort: number): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNREFUSED') {
        return `Cannot connect to PC Agent at ${pcAgentIp}:${pcAgentPort}. Make sure the PC Agent is running and accessible on the local network.`;
      }

      if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
        return `Connection to PC Agent at ${pcAgentIp}:${pcAgentPort} timed out. Please check the PC Agent status and network connectivity.`;
      }

      if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'EAI_AGAIN') {
        return `Cannot resolve PC Agent address: ${pcAgentIp}. Please verify the IP address is correct.`;
      }

      if (axiosError.response) {
        // PC Agent responded with error status
        const status = axiosError.response.status;
        const data = axiosError.response.data as { message?: string } | undefined;
        return `PC Agent error (${status}): ${data?.message || axiosError.message}`;
      }

      return `PC Agent connection error: ${axiosError.message}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error connecting to PC Agent';
  }
}

// Singleton instance
export const pcAgentService = new PcAgentService();

