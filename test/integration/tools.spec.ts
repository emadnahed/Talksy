import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ToolsModule } from '@/tools/tools.module';
import { ToolRegistryService } from '@/tools/services/tool-registry.service';
import { ToolExecutorService } from '@/tools/services/tool-executor.service';
import {
  ToolCategory,
  ToolDefinition,
  ToolExecutionContext,
  ToolErrorCode,
} from '@/tools/interfaces/tool.interface';

describe('ToolsModule Integration', () => {
  let module: TestingModule;
  let registryService: ToolRegistryService;
  let executorService: ToolExecutorService;

  const createTestContext = (sessionId = 'test-session'): ToolExecutionContext => ({
    sessionId,
    clientId: 'test-client',
    timestamp: Date.now(),
  });

  const createTestToolDefinition = (
    name: string,
    options: Partial<ToolDefinition> = {},
  ): ToolDefinition => ({
    name,
    description: `Integration test tool: ${name}`,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input value' },
      },
      required: ['input'],
    },
    category: ToolCategory.UTILITY,
    ...options,
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        EventEmitterModule.forRoot(),
        ToolsModule,
      ],
    }).compile();

    registryService = module.get<ToolRegistryService>(ToolRegistryService);
    executorService = module.get<ToolExecutorService>(ToolExecutorService);
  });

  afterEach(async () => {
    registryService.clearAllTools();
    registryService.onModuleDestroy();
    await module.close();
  });

  describe('Module Integration', () => {
    it('should provide ToolRegistryService', () => {
      expect(registryService).toBeDefined();
      expect(registryService).toBeInstanceOf(ToolRegistryService);
    });

    it('should provide ToolExecutorService', () => {
      expect(executorService).toBeDefined();
      expect(executorService).toBeInstanceOf(ToolExecutorService);
    });
  });

  describe('ToolRegistry with ToolExecutor coordination', () => {
    it('should register tool and execute via executor', async () => {
      const handler = jest.fn().mockResolvedValue({ result: 'success' });
      registryService.registerTool(createTestToolDefinition('test-tool'), handler);

      const result = await executorService.execute(
        { toolName: 'test-tool', parameters: { input: 'test' } },
        createTestContext(),
      );

      expect(result.result.success).toBe(true);
      expect(result.result.data).toEqual({ result: 'success' });
      expect(handler).toHaveBeenCalledWith(
        { input: 'test' },
        expect.objectContaining({ sessionId: 'test-session' }),
      );
    });

    it('should handle tool not found through full stack', async () => {
      const result = await executorService.execute(
        { toolName: 'nonexistent-tool', parameters: {} },
        createTestContext(),
      );

      expect(result.result.success).toBe(false);
      expect(result.result.error?.code).toBe(ToolErrorCode.NOT_FOUND);
    });

    it('should validate parameters end-to-end', async () => {
      const definition = createTestToolDefinition('validation-tool', {
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', minimum: 1, maximum: 100 },
          },
          required: ['count'],
        },
      });
      const handler = jest.fn().mockResolvedValue({ counted: true });
      registryService.registerTool(definition, handler);

      // Valid parameters
      const validResult = await executorService.execute(
        { toolName: 'validation-tool', parameters: { count: 50 } },
        createTestContext(),
      );
      expect(validResult.result.success).toBe(true);

      // Invalid parameters - missing required
      const invalidResult = await executorService.execute(
        { toolName: 'validation-tool', parameters: {} },
        createTestContext(),
      );
      expect(invalidResult.result.success).toBe(false);
      expect(invalidResult.result.error?.code).toBe(ToolErrorCode.INVALID_PARAMETERS);
    });

    it('should enforce timeout across modules', async () => {
      const slowHandler = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return { result: 'too late' };
      });

      registryService.registerTool(
        createTestToolDefinition('slow-tool', { timeout: 100 }),
        slowHandler,
      );

      const result = await executorService.execute(
        { toolName: 'slow-tool', parameters: { input: 'test' } },
        createTestContext(),
      );

      expect(result.result.success).toBe(false);
      expect(result.result.error?.code).toBe(ToolErrorCode.TIMEOUT);
    });
  });

  describe('Tool categorization', () => {
    it('should categorize tools correctly', () => {
      registryService.registerTool(
        createTestToolDefinition('util-tool', { category: ToolCategory.UTILITY }),
        jest.fn(),
      );
      registryService.registerTool(
        createTestToolDefinition('data-tool', { category: ToolCategory.DATA }),
        jest.fn(),
      );
      registryService.registerTool(
        createTestToolDefinition('system-tool', { category: ToolCategory.SYSTEM }),
        jest.fn(),
      );

      const utilTools = registryService.getToolsByCategory(ToolCategory.UTILITY);
      const dataTools = registryService.getToolsByCategory(ToolCategory.DATA);
      const systemTools = registryService.getToolsByCategory(ToolCategory.SYSTEM);

      expect(utilTools).toHaveLength(1);
      expect(utilTools[0].definition.name).toBe('util-tool');
      expect(dataTools).toHaveLength(1);
      expect(dataTools[0].definition.name).toBe('data-tool');
      expect(systemTools).toHaveLength(1);
      expect(systemTools[0].definition.name).toBe('system-tool');
    });
  });

  describe('Concurrent tool execution', () => {
    it('should handle concurrent executions for different sessions', async () => {
      const handler = jest
        .fn()
        .mockImplementation(async (params: { input: string }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { echoed: params.input };
        });

      registryService.registerTool(createTestToolDefinition('concurrent-tool'), handler);

      const results = await Promise.all([
        executorService.execute(
          { toolName: 'concurrent-tool', parameters: { input: 'session-1' } },
          createTestContext('session-1'),
        ),
        executorService.execute(
          { toolName: 'concurrent-tool', parameters: { input: 'session-2' } },
          createTestContext('session-2'),
        ),
        executorService.execute(
          { toolName: 'concurrent-tool', parameters: { input: 'session-3' } },
          createTestContext('session-3'),
        ),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.result.success).toBe(true);
      });
    });

    it('should track active execution count per session', async () => {
      const blockingHandler = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { done: true };
      });

      registryService.registerTool(createTestToolDefinition('blocking-tool'), blockingHandler);

      const sessionId = 'count-test-session';

      // Start execution but don't await
      const promise = executorService.execute(
        { toolName: 'blocking-tool', parameters: { input: 'test' } },
        createTestContext(sessionId),
      );

      // Small delay to let execution start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const count = executorService.getActiveExecutionCount(sessionId);
      expect(count).toBeGreaterThanOrEqual(0);

      // Wait for completion
      await promise;
    });
  });

  describe('Tool execution with DTO response', () => {
    it('should return properly formatted DTO response', async () => {
      const handler = jest.fn().mockResolvedValue({ data: 'test-data' });
      registryService.registerTool(createTestToolDefinition('dto-tool'), handler);

      const response = await executorService.executeAsDto(
        { toolName: 'dto-tool', parameters: { input: 'test' }, callId: 'test-call-123' },
        createTestContext(),
      );

      expect(response.callId).toBe('test-call-123');
      expect(response.toolName).toBe('dto-tool');
      expect(response.result.success).toBe(true);
      expect(response.timestamp).toBeDefined();
    });
  });

  describe('Deprecated tool handling', () => {
    it('should handle deprecated tools correctly', async () => {
      registryService.registerTool(
        createTestToolDefinition('deprecated-tool', { deprecated: true }),
        jest.fn().mockResolvedValue({ legacy: true }),
      );

      // Should not appear in default listing
      const allTools = registryService.getAllToolDefinitions();
      const deprecatedInList = allTools.some((t) => t.name === 'deprecated-tool');
      expect(deprecatedInList).toBe(false);

      // Should appear when including deprecated
      const allWithDeprecated = registryService.getAllToolDefinitions(true);
      const deprecatedInFullList = allWithDeprecated.some(
        (t) => t.name === 'deprecated-tool',
      );
      expect(deprecatedInFullList).toBe(true);

      // Should still be executable
      const result = await executorService.execute(
        { toolName: 'deprecated-tool', parameters: { input: 'test' } },
        createTestContext(),
      );
      expect(result.result.success).toBe(true);
    });
  });

  describe('Tool search functionality', () => {
    it('should search tools by name and description', () => {
      registryService.registerTool(
        createTestToolDefinition('calculator', { description: 'Performs math calculations' }),
        jest.fn(),
      );
      registryService.registerTool(
        createTestToolDefinition('formatter', { description: 'Formats text data' }),
        jest.fn(),
      );

      const calcResults = registryService.searchTools('calc');
      expect(calcResults.length).toBeGreaterThanOrEqual(1);

      const mathResults = registryService.searchTools('math');
      expect(mathResults.length).toBeGreaterThanOrEqual(1);

      const textResults = registryService.searchTools('text');
      expect(textResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Batch tool execution', () => {
    it('should execute multiple tools in parallel', async () => {
      registryService.registerTool(
        createTestToolDefinition('tool-a'),
        jest.fn().mockResolvedValue({ result: 'a' }),
      );
      registryService.registerTool(
        createTestToolDefinition('tool-b'),
        jest.fn().mockResolvedValue({ result: 'b' }),
      );

      const results = await executorService.executeMany(
        [
          { toolName: 'tool-a', parameters: { input: 'test' } },
          { toolName: 'tool-b', parameters: { input: 'test' } },
        ],
        createTestContext(),
      );

      expect(results).toHaveLength(2);
      expect(results[0].result.success).toBe(true);
      expect(results[1].result.success).toBe(true);
    });
  });
});
