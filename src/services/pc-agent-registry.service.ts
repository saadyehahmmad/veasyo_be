import { Socket } from 'socket.io';
import logger from '../utils/logger';

/**
 * PC Agent Registry Service
 * Manages active PC Agent Socket.IO connections per tenant
 * Enables reverse connection architecture (PC Agent connects to backend)
 */
export class PcAgentRegistry {
  // Map of tenantId -> PC Agent socket
  private agents: Map<string, Socket> = new Map();

  /**
   * Register a PC Agent connection for a tenant
   */
  registerAgent(tenantId: string, socket: Socket): void {
    // Disconnect existing agent for this tenant if any
    const existingSocket = this.agents.get(tenantId);
    if (existingSocket && existingSocket.connected) {
      logger.warn(`Replacing existing PC Agent connection for tenant ${tenantId}`, {
        oldSocketId: existingSocket.id,
        newSocketId: socket.id,
      });
      existingSocket.disconnect();
    }

    this.agents.set(tenantId, socket);
    logger.info(`PC Agent registered for tenant: ${tenantId}`, {
      socketId: socket.id,
      totalAgents: this.agents.size,
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`PC Agent disconnected for tenant: ${tenantId}`, {
        socketId: socket.id,
      });
      // Only remove if it's still the same socket
      if (this.agents.get(tenantId) === socket) {
        this.agents.delete(tenantId);
      }
    });
  }

  /**
   * Get PC Agent socket for a tenant
   */
  getAgent(tenantId: string): Socket | null {
    const socket = this.agents.get(tenantId);
    if (socket && socket.connected) {
      return socket;
    }
    // Clean up disconnected socket
    if (socket && !socket.connected) {
      this.agents.delete(tenantId);
    }
    return null;
  }

  /**
   * Check if PC Agent is connected for a tenant
   */
  isConnected(tenantId: string): boolean {
    const socket = this.getAgent(tenantId);
    return socket !== null;
  }

  /**
   * Unregister a PC Agent connection
   */
  unregisterAgent(tenantId: string): void {
    const socket = this.agents.get(tenantId);
    if (socket) {
      this.agents.delete(tenantId);
      logger.info(`PC Agent unregistered for tenant: ${tenantId}`);
    }
  }

  /**
   * Get all connected tenants
   */
  getConnectedTenants(): string[] {
    // Clean up disconnected sockets
    const connectedTenants: string[] = [];
    for (const [tenantId, socket] of this.agents.entries()) {
      if (socket.connected) {
        connectedTenants.push(tenantId);
      } else {
        this.agents.delete(tenantId);
      }
    }
    return connectedTenants;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    connectedAgents: number;
    tenants: string[];
  } {
    const tenants = this.getConnectedTenants();
    return {
      totalAgents: this.agents.size,
      connectedAgents: tenants.length,
      tenants,
    };
  }
}

// Singleton instance
export const pcAgentRegistry = new PcAgentRegistry();

