import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    const state = this.getConnectionState();
    this.logger.log(`📊 Database connection state: ${state}`);

    if (this.connection.readyState === 1) {
      this.logger.log(
        `✅ Connected to: ${this.connection.name} at ${this.connection.host}`,
      );
    }
  }

  // Simple health check without any queries
  health() {
    const state = this.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    const stateString = stateMap[state] || 'unknown';
    const isHealthy = state === 1;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      database: {
        state: stateString,
        name: this.connection.name,
        host: this.connection.host,
        readyState: state,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private getConnectionState(): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    return states[this.connection.readyState] || 'unknown';
  }

  getConnection(): Connection {
    return this.connection;
  }
}
