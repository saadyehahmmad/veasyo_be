import express, { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as promClient from 'prom-client';
import logger from '../utils/logger';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../models/types';

/**
 * Configure Prometheus metrics
 */
export function configureMetrics(
  app: express.Application,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  try {
    // Collect default metrics (CPU, memory, event loop, etc.)
    promClient.collectDefaultMetrics();

    // Custom metrics for Socket.IO
    const gaugeConnectedClients = new promClient.Gauge({
      name: 'waiter_connected_clients',
      help: 'Number of connected Socket.IO clients',
    });

    const gaugeTotalRooms = new promClient.Gauge({
      name: 'waiter_total_rooms',
      help: 'Total Socket.IO rooms (excluding single-socket rooms)',
    });

    const gaugeTotalSockets = new promClient.Gauge({
      name: 'waiter_total_sockets',
      help: 'Total Socket.IO sockets',
    });

    // Update metrics every 5 seconds
    setInterval(() => {
      try {
        const connectedClients = io.engine.clientsCount || 0;
        const socketsSize =
          (io.sockets.sockets as unknown as Map<string, unknown>)?.size ||
          Array.from(io.sockets.sockets.keys()).length ||
          0;

        // Compute rooms count excluding individual socket ids (adapter.sids keys)
        const adapter = io.sockets.adapter as unknown as {
          rooms?: Map<string, unknown>;
          sids?: Set<string>;
        };
        let totalRooms = 0;
        if (adapter && adapter.rooms && adapter.sids) {
          for (const [room] of adapter.rooms) {
            if (!adapter.sids.has(room)) {
              totalRooms++;
            }
          }
        } else if (adapter && adapter.rooms) {
          totalRooms = adapter.rooms.size || 0;
        }

        gaugeConnectedClients.set(connectedClients);
        gaugeTotalRooms.set(totalRooms);
        gaugeTotalSockets.set(socketsSize);
      } catch (err) {
        logger.error('Error updating Prometheus metrics', err);
      }
    }, 5000);

    // Metrics endpoint
    app.get('/metrics', async (req: Request, res: Response) => {
      try {
        res.setHeader('Content-Type', promClient.register.contentType);
        const metrics = await promClient.register.metrics();
        res.send(metrics);
      } catch (err) {
        logger.error('Failed to collect Prometheus metrics', err);
        res.status(500).send('Failed to collect metrics');
      }
    });

    logger.info('✅ Prometheus metrics configured');
  } catch (err) {
    logger.error('Prometheus metrics setup failed', err);
  }
}

