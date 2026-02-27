/**
 * API Documentation Setup
 * Uses Swagger UI and JSDoc to generate OpenAPI documentation
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { config } from '../config/env';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Fireflow Restaurant API',
            version: '1.0.0',
            description: 'Enterprise Restaurant Management System API',
            contact: {
                name: 'Fireflow Support',
                email: 'support@fireflow.com'
            }
        },
        servers: [
            {
                url: `http://localhost:${config.PORT}`,
                description: 'Local Development'
            },
            {
                url: config.VITE_API_URL,
                description: 'Production'
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    // Path to the API docs
    apis: [
        './src/api/server.ts',
        './src/api/routes/*.ts',
        './src/api/schemas/*.ts'
    ],
};

/**
 * Setup Swagger UI on the given Express app
 */
export function setupSwagger(app: Express) {
    try {
        const specs = swaggerJsdoc(options);
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
            swaggerOptions: {
                persistAuthorization: true,
            },
            customSiteTitle: 'Fireflow API Documentation'
        }));

        console.log(`📖 API Documentation available at http://localhost:${config.PORT}/api-docs`);
    } catch (err) {
        console.error('❌ Failed to setup Swagger documentation:', (err as Error).message);
    }
}
