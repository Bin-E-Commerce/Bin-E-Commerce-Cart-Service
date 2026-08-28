// File này lắp các module hạ tầng và bounded context của Cart Service.
// File không quyết định quyền truy cập; Gateway chịu trách nhiệm auth còn Cart Service xác định owner từ header.

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthModule } from "./modules/health/health.module";
import { CartModule } from "./modules/cart/cart.module";

// Khai báo dependency graph của Cart Service, gồm Postgres và các module nghiệp vụ Phase 1.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("POSTGRES_HOST", "localhost"),
        port: config.get<number>("POSTGRES_PORT", 5432),
        username: config.get<string>("POSTGRES_USER"),
        password: config.get<string>("POSTGRES_PASSWORD"),
        database: config.get<string>("POSTGRES_DB"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        migrations: [__dirname + "/database/migrations/*{.ts,.js}"],
        migrationsRun: config.get<string>("NODE_ENV") === "production",
        synchronize: config.get<string>("NODE_ENV") !== "production",
        ssl:
          config.get<string>("NODE_ENV") === "production"
            ? { rejectUnauthorized: false }
            : false,
        logging: config.get<string>("TYPEORM_LOGGING", "false") === "true",
      }),
    }),
    HealthModule,
    CartModule,
  ],
})
export class AppModule {}
