import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async onModuleInit() {
    // Log connection status when module initializes
    const state = this.getConnectionState();
    this.logger.log(`📊 Database connection state: ${state}`);
    
    if (this.connection.readyState === 1) {
      this.logger.log(`✅ Connected to database: ${this.connection.name}`);
      this.logger.log(`🔗 Host: ${this.connection.host}`);
      this.logger.log(`📦 Collections: ${Object.keys(this.connection.collections).length}`);
    }
  }

  health() {
    const state = this.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      status: state === 1 ? 'healthy' : 'unhealthy',
      database: {
        state: stateMap[state] || 'unknown',
        name: this.connection.name,
        host: this.connection.host,
        collections: Object.keys(this.connection.collections),
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