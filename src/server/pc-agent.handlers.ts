import { Server, Socket } from 'socket.io';
import logger from '../utils/logger';
import { pcAgentRegistry } from '../services/pc-agent-registry.service';

/**
 * PC Agent Socket.IO Event Types
 */
interface PcAgentToServerEvents {
  'pc-agent:register': (data: { tenantId: string }) => void;
  'pc-agent:print-result': (data: {
    jobId: string;
    success: boolean;
    message: string;
  }) => void;
  'pc-agent:health': (data: { status: string; timestamp: string }) => void;
}

interface ServerToPcAgentEvents {
  'pc-agent:print-job': (data: {
    jobId: string;
    text: string;
    format: 'base64';
  }) => void;
  'pc-agent:connected': (data: { message: string }) => void;
  'pc-agent:error': (data: { message: string }) => void;
}

/**
 * Setup PC Agent namespace for reverse connections
 * PC Agents connect to this namespace and register themselves
 */
export function setupPcAgentNamespace(io: Server): void {
  const pcAgentNamespace = io.of('/pc-agent');

  pcAgentNamespace.on('connection', (socket: Socket<PcAgentToServerEvents, ServerToPcAgentEvents>) => {
    // Type assertion needed because registry uses generic Socket type
    const genericSocket = socket as unknown as Socket;
    logger.info(`PC Agent connected: ${socket.id}`);

    // Handle PC Agent registration
    socket.on('pc-agent:register', (data: { tenantId: string }) => {
      const { tenantId } = data;

      if (!tenantId || typeof tenantId !== 'string') {
        logger.error(`Invalid tenant ID from PC Agent ${socket.id}`);
        socket.emit('pc-agent:error', {
          message: 'Invalid tenant ID. Please provide a valid tenant ID.',
        });
        socket.disconnect();
        return;
      }

      // Register the PC Agent
      pcAgentRegistry.registerAgent(tenantId, genericSocket);
      
      logger.info(`PC Agent registered for tenant: ${tenantId}`, {
        socketId: socket.id,
      });

      // Send confirmation
      socket.emit('pc-agent:connected', {
        message: `PC Agent registered successfully for tenant: ${tenantId}`,
      });
    });

    // Handle print job results
    socket.on('pc-agent:print-result', (data) => {
      logger.info(`Print job result received from PC Agent`, {
        jobId: data.jobId,
        success: data.success,
        message: data.message,
      });
      // The result is handled by the promise resolver in printer integration
    });

    // Handle health updates
    socket.on('pc-agent:health', (data) => {
      logger.debug(`PC Agent health update: ${data.status}`, {
        socketId: socket.id,
        timestamp: data.timestamp,
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`PC Agent disconnected: ${socket.id}`, { reason });
      // Registry will handle cleanup automatically
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`PC Agent socket error: ${socket.id}`, { error });
    });

    // If no registration within 10 seconds, disconnect
    const registrationTimeout = setTimeout(() => {
      if (socket.connected) {
        logger.warn(`PC Agent ${socket.id} did not register within timeout, disconnecting`);
        socket.emit('pc-agent:error', {
          message: 'Registration timeout. Please register immediately after connecting.',
        });
        socket.disconnect();
      }
    }, 10000);

    socket.on('pc-agent:register', () => {
      clearTimeout(registrationTimeout);
    });
  });

  logger.info('✅ PC Agent namespace configured at /pc-agent');
}

