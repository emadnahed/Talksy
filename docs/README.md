# Talksy Documentation

This directory contains the documentation for Talksy, a production-grade, real-time AI assistant backend built with NestJS.

## Structure

The documentation is organized into two main sections:

### API Documentation (Scalar)
- Located in `api/` directory
- Contains OpenAPI specification and Scalar API documentation
- Technical reference for API endpoints and WebSocket events

### Customer Documentation (Nextra)
- Located in `customer/` directory
- Contains user-facing documentation
- Guides, tutorials, and reference materials

## API Documentation (Scalar)

The API documentation is available as:

1. OpenAPI specification: `api/openapi.yaml`
2. Interactive documentation: `api/index.html`

To view the interactive API documentation, serve the `api` directory using a web server.

## Customer Documentation (Nextra)

The customer documentation is built with Nextra and includes:

- Getting Started guide
- API Reference
- Features documentation
- Tools documentation
- Sessions documentation
- Examples
- Technical reference

### Running the Documentation Locally

To run the customer documentation locally:

1. Navigate to the docs directory: `cd docs`
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open your browser to `http://localhost:3000`

### Building the Documentation

To build the documentation for production:

1. Navigate to the docs directory: `cd docs`
2. Build the site: `npm run build`

## Contributing

To contribute to the documentation:

1. Fork the repository
2. Make your changes
3. Test the documentation locally
4. Submit a pull request

## License

The documentation is licensed under the MIT License.