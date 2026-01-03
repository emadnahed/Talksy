import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryService } from './tool-registry.service';
import {
  ToolDefinition,
  ToolErrorCode,
  ToolExecutionContext,
} from '../interfaces/tool.interface';
import { TOOL_DEFAULTS, TOOL_EVENTS } from '../constants/tool.constants';

describe('ToolExecutorService', () => {
  let service: ToolExecutorService;
  let registryService: ToolRegistryService;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockConfigService: Partial<ConfigService>;

  const createTestContext = (
    sessionId = 'test-session',
  ): ToolExecutionContext => ({
    sessionId,
    clientId: 'test-client',
    timestamp: Date.now(),
  });

  const createMockToolDefinition = (
    name: string,
    options: Partial<ToolDefinition> = {},
  ): ToolDefinition => ({
    name,
    description: `Test tool: ${name}`,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input value' },
      },
      required: ['input'],
    },
    ...options,
  });

  beforeEach(async () => {
    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        ToolRegistryService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ToolExecutorService>(ToolExecutorService);
    registryService = module.get<ToolRegistryService>(ToolRegistryService);
  });

  afterEach(() => {
    registryService.onModuleDestroy();
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should work without ConfigService', async () => {
      const moduleWithoutConfig = await Test.createTestingModule({
        providers: [ToolExecutorService, ToolRegistryService],
      }).compile();

      const serviceWithoutConfig =
        moduleWithoutConfig.get<ToolExecutorService>(ToolExecutorService);

      expect(serviceWithoutConfig).toBeDefined();

      moduleWithoutConfig
        .get<ToolRegistryService>(ToolRegistryService)
        .onModuleDestroy();
    });
  });

  describe('execute', () => {
    it('should execute a tool successfully', async () => {
      const handler = jest.fn().mockResolvedValue({ data: 'result' });
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        handler,
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.result.success).toBe(true);
      expect(response.result.data).toEqual({ data: 'result' });
      expect(handler).toHaveBeenCalledWith(
        { input: 'hello' },
        expect.objectContaining({ sessionId: 'test-session' }),
      );
    });

    it('should generate callId if not provided', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.callId).toBeDefined();
      expect(response.callId.length).toBeGreaterThan(0);
    });

    it('should use provided callId', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        {
          toolName: 'test-tool',
          parameters: { input: 'hello' },
          callId: 'my-call-id',
        },
        createTestContext(),
      );

      expect(response.callId).toBe('my-call-id');
    });

    it('should return NOT_FOUND error for non-existent tool', async () => {
      const response = await service.execute(
        { toolName: 'non-existent', parameters: {} },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(ToolErrorCode.NOT_FOUND);
      expect(response.result.error?.message).toContain('non-existent');
    });

    it('should return INVALID_PARAMETERS for missing required parameter', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: {} },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(
        ToolErrorCode.INVALID_PARAMETERS,
      );
      expect(response.result.error?.message).toContain(
        'Missing required parameter',
      );
    });

    it('should return INVALID_PARAMETERS for unknown parameter', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        {
          toolName: 'test-tool',
          parameters: { input: 'hello', unknown: 'value' },
        },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(
        ToolErrorCode.INVALID_PARAMETERS,
      );
      expect(response.result.error?.message).toContain('Unknown parameter');
    });

    it('should return INVALID_PARAMETERS for wrong type', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: 123 } },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(
        ToolErrorCode.INVALID_PARAMETERS,
      );
      expect(response.result.error?.message).toContain('Invalid type');
    });

    it('should validate enum values', async () => {
      const definition: ToolDefinition = {
        name: 'enum-tool',
        description: 'Tool with enum',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
          required: ['status'],
        },
      };
      registryService.registerTool(definition, jest.fn().mockResolvedValue({}));

      const invalidResponse = await service.execute(
        { toolName: 'enum-tool', parameters: { status: 'unknown' } },
        createTestContext(),
      );

      expect(invalidResponse.result.success).toBe(false);
      expect(invalidResponse.result.error?.message).toContain('must be one of');

      const validResponse = await service.execute(
        { toolName: 'enum-tool', parameters: { status: 'active' } },
        createTestContext(),
      );

      expect(validResponse.result.success).toBe(true);
    });

    it('should handle EXECUTION_FAILED for handler errors', async () => {
      registryService.registerTool(
        createMockToolDefinition('failing-tool'),
        jest.fn().mockRejectedValue(new Error('Handler failed')),
      );

      const response = await service.execute(
        { toolName: 'failing-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(response.result.error?.message).toBe('Handler failed');
    });

    it('should handle timeout', async () => {
      registryService.registerTool(
        { ...createMockToolDefinition('slow-tool'), timeout: 50 },
        jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 200)),
          ),
      );

      const response = await service.execute(
        { toolName: 'slow-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(ToolErrorCode.TIMEOUT);
    });

    it('should emit execution started event', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TOOL_EVENTS.TOOL_EXECUTION_STARTED,
        expect.objectContaining({
          toolName: 'test-tool',
          sessionId: 'test-session',
        }),
      );
    });

    it('should emit execution completed event on success', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TOOL_EVENTS.TOOL_EXECUTION_COMPLETED,
        expect.objectContaining({
          toolName: 'test-tool',
          sessionId: 'test-session',
        }),
      );
    });

    it('should emit execution failed event on error', async () => {
      registryService.registerTool(
        createMockToolDefinition('failing-tool'),
        jest.fn().mockRejectedValue(new Error('Test error')),
      );

      await service.execute(
        { toolName: 'failing-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TOOL_EVENTS.TOOL_EXECUTION_FAILED,
        expect.objectContaining({
          toolName: 'failing-tool',
          sessionId: 'test-session',
          error: 'Test error',
        }),
      );
    });

    it('should include execution time in response', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp in response', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const beforeExec = Date.now();
      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.timestamp).toBeGreaterThanOrEqual(beforeExec);
    });
  });

  describe('executeAsDto', () => {
    it('should return DTO format', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({ data: 'result' }),
      );

      const dto = await service.executeAsDto(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(dto.callId).toBeDefined();
      expect(dto.toolName).toBe('test-tool');
      expect(dto.result.success).toBe(true);
      expect(dto.result.data).toEqual({ data: 'result' });
      expect(dto.timestamp).toBeDefined();
    });
  });

  describe('executeMany', () => {
    it('should execute multiple tools in parallel', async () => {
      const handler1 = jest.fn().mockResolvedValue({ result: 1 });
      const handler2 = jest.fn().mockResolvedValue({ result: 2 });

      registryService.registerTool(
        createMockToolDefinition('tool-1'),
        handler1,
      );
      registryService.registerTool(
        createMockToolDefinition('tool-2'),
        handler2,
      );

      const responses = await service.executeMany(
        [
          { toolName: 'tool-1', parameters: { input: 'a' } },
          { toolName: 'tool-2', parameters: { input: 'b' } },
        ],
        createTestContext(),
      );

      expect(responses).toHaveLength(2);
      expect(responses[0].result.success).toBe(true);
      expect(responses[1].result.success).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      registryService.registerTool(
        createMockToolDefinition('success-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const responses = await service.executeMany(
        [
          { toolName: 'success-tool', parameters: { input: 'a' } },
          { toolName: 'non-existent', parameters: {} },
        ],
        createTestContext(),
      );

      expect(responses[0].result.success).toBe(true);
      expect(responses[1].result.success).toBe(false);
    });
  });

  describe('concurrency control', () => {
    it('should track active executions', async () => {
      let resolveHandler: (value?: unknown) => void;
      const handler = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveHandler = resolve;
          }),
      );

      registryService.registerTool(
        createMockToolDefinition('slow-tool'),
        handler,
      );

      const execPromise = service.execute(
        { toolName: 'slow-tool', parameters: { input: 'hello' } },
        createTestContext('session-1'),
      );

      // Wait for handler to be called
      await new Promise((r) => setTimeout(r, 10));

      expect(service.getActiveExecutionCount('session-1')).toBe(1);

      resolveHandler!();
      await execPromise;

      expect(service.getActiveExecutionCount('session-1')).toBe(0);
    });

    it('should return RATE_LIMITED when max concurrent executions reached', async () => {
      const slowHandler = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000)),
        );

      registryService.registerTool(
        createMockToolDefinition('slow-tool'),
        slowHandler,
      );

      // Start max concurrent executions
      const promises = [];
      for (let i = 0; i < TOOL_DEFAULTS.MAX_CONCURRENT_EXECUTIONS; i++) {
        promises.push(
          service.execute(
            { toolName: 'slow-tool', parameters: { input: 'hello' } },
            createTestContext('session-1'),
          ),
        );
      }

      // Wait for all to start
      await new Promise((r) => setTimeout(r, 10));

      // This should be rate limited
      const response = await service.execute(
        { toolName: 'slow-tool', parameters: { input: 'hello' } },
        createTestContext('session-1'),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(ToolErrorCode.RATE_LIMITED);

      // Different session should work
      const otherSessionResponse = await service.execute(
        { toolName: 'slow-tool', parameters: { input: 'hello' } },
        createTestContext('session-2'),
      );

      // Will also be slow but not rate limited
      expect(otherSessionResponse.result.error?.code).not.toBe(
        ToolErrorCode.RATE_LIMITED,
      );
    });

    it('should return 0 for session with no active executions', () => {
      expect(service.getActiveExecutionCount('unknown-session')).toBe(0);
    });
  });

  describe('parameter size validation', () => {
    it('should accept parameters within size limit', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.result.success).toBe(true);
    });

    it('should reject parameters exceeding size limit', async () => {
      // Create a very large parameter value
      const largeValue = 'x'.repeat(TOOL_DEFAULTS.MAX_PARAMETER_SIZE + 1);

      registryService.registerTool(
        {
          name: 'test-tool',
          description: 'Test',
          parameters: {
            type: 'object',
            properties: { input: { type: 'string' } },
          },
        },
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: largeValue } },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(
        ToolErrorCode.INVALID_PARAMETERS,
      );
      expect(response.result.error?.message).toContain('exceeds maximum');
    });
  });

  describe('type validation', () => {
    it('should accept correct types', async () => {
      const definition: ToolDefinition = {
        name: 'typed-tool',
        description: 'Tool with types',
        parameters: {
          type: 'object',
          properties: {
            stringVal: { type: 'string' },
            numberVal: { type: 'number' },
            boolVal: { type: 'boolean' },
            arrayVal: { type: 'array', items: { type: 'string' } },
          },
          required: ['stringVal', 'numberVal', 'boolVal', 'arrayVal'],
        },
      };
      registryService.registerTool(definition, jest.fn().mockResolvedValue({}));

      const response = await service.execute(
        {
          toolName: 'typed-tool',
          parameters: {
            stringVal: 'hello',
            numberVal: 42,
            boolVal: true,
            arrayVal: ['a', 'b'],
          },
        },
        createTestContext(),
      );

      expect(response.result.success).toBe(true);
    });

    it('should reject array when expecting non-array', async () => {
      registryService.registerTool(
        createMockToolDefinition('test-tool'),
        jest.fn().mockResolvedValue({}),
      );

      const response = await service.execute(
        { toolName: 'test-tool', parameters: { input: ['array'] } },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(
        ToolErrorCode.INVALID_PARAMETERS,
      );
    });

    it('should reject non-array when expecting array', async () => {
      const definition: ToolDefinition = {
        name: 'array-tool',
        description: 'Tool with array',
        parameters: {
          type: 'object',
          properties: {
            items: { type: 'array' },
          },
          required: ['items'],
        },
      };
      registryService.registerTool(definition, jest.fn().mockResolvedValue({}));

      const response = await service.execute(
        { toolName: 'array-tool', parameters: { items: 'not-an-array' } },
        createTestContext(),
      );

      expect(response.result.success).toBe(false);
      expect(response.result.error?.code).toBe(
        ToolErrorCode.INVALID_PARAMETERS,
      );
    });
  });

  describe('synchronous handler support', () => {
    it('should support synchronous handlers', async () => {
      const syncHandler = jest.fn().mockReturnValue({ sync: true });
      registryService.registerTool(
        createMockToolDefinition('sync-tool'),
        syncHandler,
      );

      const response = await service.execute(
        { toolName: 'sync-tool', parameters: { input: 'hello' } },
        createTestContext(),
      );

      expect(response.result.success).toBe(true);
      expect(response.result.data).toEqual({ sync: true });
    });
  });
});
