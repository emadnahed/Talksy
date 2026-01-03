import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ToolRegistryService } from './tool-registry.service';
import {
  ToolDefinition,
  ToolCategory,
  ToolHandler,
} from '../interfaces/tool.interface';
import { TOOL_DEFAULTS, TOOL_EVENTS } from '../constants/tool.constants';

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;
  let mockEventEmitter: Partial<EventEmitter2>;

  const createMockToolDefinition = (
    name: string,
    category?: ToolCategory,
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
    category,
  });

  const mockHandler: ToolHandler = async (params) => {
    return { result: params };
  };

  beforeEach(async () => {
    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolRegistryService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ToolRegistryService>(ToolRegistryService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with empty tool registry', () => {
      expect(service.getToolCount()).toBe(0);
    });

    it('should work without EventEmitter', async () => {
      const moduleWithoutEmitter = await Test.createTestingModule({
        providers: [ToolRegistryService],
      }).compile();

      const serviceWithoutEmitter =
        moduleWithoutEmitter.get<ToolRegistryService>(ToolRegistryService);

      expect(serviceWithoutEmitter).toBeDefined();
      expect(() =>
        serviceWithoutEmitter.registerTool(
          createMockToolDefinition('test'),
          mockHandler,
        ),
      ).not.toThrow();

      serviceWithoutEmitter.onModuleDestroy();
    });
  });

  describe('registerTool', () => {
    it('should register a tool successfully', () => {
      const definition = createMockToolDefinition('test-tool');

      const result = service.registerTool(definition, mockHandler);

      expect(result).toBe(true);
      expect(service.hasTool('test-tool')).toBe(true);
    });

    it('should apply default values to tool definition', () => {
      const definition = createMockToolDefinition('test-tool');

      service.registerTool(definition, mockHandler);
      const registered = service.getToolDefinition('test-tool');

      expect(registered).not.toBeNull();
      expect(registered!.category).toBe(ToolCategory.CUSTOM);
      expect(registered!.version).toBe(TOOL_DEFAULTS.DEFAULT_VERSION);
      expect(registered!.timeout).toBe(TOOL_DEFAULTS.EXECUTION_TIMEOUT_MS);
    });

    it('should preserve custom values in tool definition', () => {
      const definition: ToolDefinition = {
        ...createMockToolDefinition('test-tool', ToolCategory.DATA),
        version: '2.0.0',
        timeout: 5000,
      };

      service.registerTool(definition, mockHandler);
      const registered = service.getToolDefinition('test-tool');

      expect(registered!.category).toBe(ToolCategory.DATA);
      expect(registered!.version).toBe('2.0.0');
      expect(registered!.timeout).toBe(5000);
    });

    it('should not register duplicate tool without override option', () => {
      const definition = createMockToolDefinition('test-tool');

      service.registerTool(definition, mockHandler);
      const result = service.registerTool(definition, mockHandler);

      expect(result).toBe(false);
      expect(service.getToolCount()).toBe(1);
    });

    it('should override existing tool with override option', () => {
      const definition1 = createMockToolDefinition('test-tool');
      const definition2: ToolDefinition = {
        ...createMockToolDefinition('test-tool'),
        description: 'Updated description',
      };

      service.registerTool(definition1, mockHandler);
      const result = service.registerTool(definition2, mockHandler, {
        override: true,
      });

      expect(result).toBe(true);
      expect(service.getToolDefinition('test-tool')!.description).toBe(
        'Updated description',
      );
    });

    it('should emit event on successful registration', () => {
      const definition = createMockToolDefinition('test-tool');

      service.registerTool(definition, mockHandler);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TOOL_EVENTS.TOOL_REGISTERED,
        expect.objectContaining({
          toolName: 'test-tool',
          category: ToolCategory.CUSTOM,
        }),
      );
    });

    it('should update category index when overriding with different category', () => {
      const definition1 = createMockToolDefinition(
        'test-tool',
        ToolCategory.DATA,
      );
      const definition2 = createMockToolDefinition(
        'test-tool',
        ToolCategory.UTILITY,
      );

      service.registerTool(definition1, mockHandler);
      service.registerTool(definition2, mockHandler, { override: true });

      expect(service.getToolsByCategory(ToolCategory.DATA)).toHaveLength(0);
      expect(service.getToolsByCategory(ToolCategory.UTILITY)).toHaveLength(1);
    });
  });

  describe('registerTools', () => {
    it('should register multiple tools at once', () => {
      const tools = [
        {
          definition: createMockToolDefinition('tool-1'),
          handler: mockHandler,
        },
        {
          definition: createMockToolDefinition('tool-2'),
          handler: mockHandler,
        },
        {
          definition: createMockToolDefinition('tool-3'),
          handler: mockHandler,
        },
      ];

      const count = service.registerTools(tools);

      expect(count).toBe(3);
      expect(service.getToolCount()).toBe(3);
    });

    it('should return count of successfully registered tools', () => {
      const definition = createMockToolDefinition('existing-tool');
      service.registerTool(definition, mockHandler);

      const tools = [
        {
          definition: createMockToolDefinition('tool-1'),
          handler: mockHandler,
        },
        {
          definition: createMockToolDefinition('existing-tool'),
          handler: mockHandler,
        },
        {
          definition: createMockToolDefinition('tool-2'),
          handler: mockHandler,
        },
      ];

      const count = service.registerTools(tools);

      expect(count).toBe(2);
      expect(service.getToolCount()).toBe(3);
    });
  });

  describe('unregisterTool', () => {
    it('should unregister an existing tool', () => {
      const definition = createMockToolDefinition('test-tool');
      service.registerTool(definition, mockHandler);

      const result = service.unregisterTool('test-tool');

      expect(result).toBe(true);
      expect(service.hasTool('test-tool')).toBe(false);
    });

    it('should return false for non-existent tool', () => {
      const result = service.unregisterTool('non-existent');

      expect(result).toBe(false);
    });

    it('should emit event on successful unregistration', () => {
      const definition = createMockToolDefinition('test-tool');
      service.registerTool(definition, mockHandler);

      service.unregisterTool('test-tool');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TOOL_EVENTS.TOOL_UNREGISTERED,
        expect.objectContaining({ toolName: 'test-tool' }),
      );
    });

    it('should remove tool from category index', () => {
      const definition = createMockToolDefinition(
        'test-tool',
        ToolCategory.DATA,
      );
      service.registerTool(definition, mockHandler);

      service.unregisterTool('test-tool');

      expect(service.getToolsByCategory(ToolCategory.DATA)).toHaveLength(0);
    });
  });

  describe('getTool', () => {
    it('should return tool with handler', () => {
      const definition = createMockToolDefinition('test-tool');
      service.registerTool(definition, mockHandler);

      const tool = service.getTool('test-tool');

      expect(tool).not.toBeNull();
      expect(tool!.definition.name).toBe('test-tool');
      expect(typeof tool!.handler).toBe('function');
    });

    it('should return null for non-existent tool', () => {
      const tool = service.getTool('non-existent');

      expect(tool).toBeNull();
    });

    it('should return deprecated tool with warning', () => {
      const definition: ToolDefinition = {
        ...createMockToolDefinition('deprecated-tool'),
        deprecated: true,
      };
      service.registerTool(definition, mockHandler);

      const tool = service.getTool('deprecated-tool');

      expect(tool).not.toBeNull();
      expect(tool!.definition.deprecated).toBe(true);
    });
  });

  describe('getToolDefinition', () => {
    it('should return tool definition', () => {
      const definition = createMockToolDefinition('test-tool');
      service.registerTool(definition, mockHandler);

      const result = service.getToolDefinition('test-tool');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('test-tool');
    });

    it('should return null for non-existent tool', () => {
      const result = service.getToolDefinition('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('hasTool', () => {
    it('should return true for existing tool', () => {
      service.registerTool(createMockToolDefinition('test-tool'), mockHandler);

      expect(service.hasTool('test-tool')).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      expect(service.hasTool('non-existent')).toBe(false);
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools', () => {
      service.registerTool(createMockToolDefinition('tool-1'), mockHandler);
      service.registerTool(createMockToolDefinition('tool-2'), mockHandler);

      const tools = service.getAllTools();

      expect(tools).toHaveLength(2);
    });

    it('should exclude deprecated tools by default', () => {
      service.registerTool(
        createMockToolDefinition('active-tool'),
        mockHandler,
      );
      service.registerTool(
        { ...createMockToolDefinition('deprecated-tool'), deprecated: true },
        mockHandler,
      );

      const tools = service.getAllTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].definition.name).toBe('active-tool');
    });

    it('should include deprecated tools when requested', () => {
      service.registerTool(
        createMockToolDefinition('active-tool'),
        mockHandler,
      );
      service.registerTool(
        { ...createMockToolDefinition('deprecated-tool'), deprecated: true },
        mockHandler,
      );

      const tools = service.getAllTools(true);

      expect(tools).toHaveLength(2);
    });
  });

  describe('getAllToolDefinitions', () => {
    it('should return all tool definitions', () => {
      service.registerTool(createMockToolDefinition('tool-1'), mockHandler);
      service.registerTool(createMockToolDefinition('tool-2'), mockHandler);

      const definitions = service.getAllToolDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions.every((d) => 'name' in d && 'description' in d)).toBe(
        true,
      );
    });
  });

  describe('getToolDefinitionDtos', () => {
    it('should return tool definitions as DTOs', () => {
      service.registerTool(
        createMockToolDefinition('tool-1', ToolCategory.DATA),
        mockHandler,
      );

      const dtos = service.getToolDefinitionDtos();

      expect(dtos).toHaveLength(1);
      expect(dtos[0].name).toBe('tool-1');
      expect(dtos[0].category).toBe(ToolCategory.DATA);
    });
  });

  describe('getToolsByCategory', () => {
    it('should return tools filtered by category', () => {
      service.registerTool(
        createMockToolDefinition('data-tool', ToolCategory.DATA),
        mockHandler,
      );
      service.registerTool(
        createMockToolDefinition('utility-tool', ToolCategory.UTILITY),
        mockHandler,
      );

      const dataTools = service.getToolsByCategory(ToolCategory.DATA);
      const utilityTools = service.getToolsByCategory(ToolCategory.UTILITY);

      expect(dataTools).toHaveLength(1);
      expect(dataTools[0].definition.name).toBe('data-tool');
      expect(utilityTools).toHaveLength(1);
      expect(utilityTools[0].definition.name).toBe('utility-tool');
    });

    it('should return empty array for category with no tools', () => {
      const tools = service.getToolsByCategory(ToolCategory.SYSTEM);

      expect(tools).toEqual([]);
    });

    it('should exclude deprecated tools from category', () => {
      service.registerTool(
        createMockToolDefinition('active-tool', ToolCategory.DATA),
        mockHandler,
      );
      service.registerTool(
        {
          ...createMockToolDefinition('deprecated-tool', ToolCategory.DATA),
          deprecated: true,
        },
        mockHandler,
      );

      const tools = service.getToolsByCategory(ToolCategory.DATA);

      expect(tools).toHaveLength(1);
      expect(tools[0].definition.name).toBe('active-tool');
    });
  });

  describe('getToolCount', () => {
    it('should return correct count', () => {
      expect(service.getToolCount()).toBe(0);

      service.registerTool(createMockToolDefinition('tool-1'), mockHandler);
      expect(service.getToolCount()).toBe(1);

      service.registerTool(createMockToolDefinition('tool-2'), mockHandler);
      expect(service.getToolCount()).toBe(2);

      service.unregisterTool('tool-1');
      expect(service.getToolCount()).toBe(1);
    });

    it('should exclude deprecated tools by default', () => {
      service.registerTool(
        createMockToolDefinition('active-tool'),
        mockHandler,
      );
      service.registerTool(
        { ...createMockToolDefinition('deprecated-tool'), deprecated: true },
        mockHandler,
      );

      expect(service.getToolCount()).toBe(1);
      expect(service.getToolCount(true)).toBe(2);
    });
  });

  describe('searchTools', () => {
    beforeEach(() => {
      service.registerTool(
        {
          ...createMockToolDefinition('calculator'),
          description: 'Performs mathematical calculations',
        },
        mockHandler,
      );
      service.registerTool(
        {
          ...createMockToolDefinition('weather-api'),
          description: 'Fetches weather data from API',
        },
        mockHandler,
      );
      service.registerTool(
        {
          ...createMockToolDefinition('file-reader'),
          description: 'Reads files from disk',
        },
        mockHandler,
      );
    });

    it('should search by name', () => {
      const results = service.searchTools('calc');

      expect(results).toHaveLength(1);
      expect(results[0].definition.name).toBe('calculator');
    });

    it('should search by description', () => {
      const results = service.searchTools('API');

      expect(results).toHaveLength(1);
      expect(results[0].definition.name).toBe('weather-api');
    });

    it('should be case-insensitive', () => {
      const results = service.searchTools('WEATHER');

      expect(results).toHaveLength(1);
      expect(results[0].definition.name).toBe('weather-api');
    });

    it('should return multiple matches', () => {
      const results = service.searchTools('file');

      expect(results).toHaveLength(1); // file-reader only
    });

    it('should return empty array for no matches', () => {
      const results = service.searchTools('xyz');

      expect(results).toEqual([]);
    });

    it('should exclude deprecated tools', () => {
      service.registerTool(
        {
          ...createMockToolDefinition('deprecated-calc'),
          description: 'Old calculator',
          deprecated: true,
        },
        mockHandler,
      );

      const results = service.searchTools('calc');

      expect(results).toHaveLength(1);
      expect(results[0].definition.name).toBe('calculator');
    });
  });

  describe('clearAllTools', () => {
    it('should remove all tools', () => {
      service.registerTool(createMockToolDefinition('tool-1'), mockHandler);
      service.registerTool(createMockToolDefinition('tool-2'), mockHandler);

      service.clearAllTools();

      expect(service.getToolCount()).toBe(0);
      expect(service.hasTool('tool-1')).toBe(false);
      expect(service.hasTool('tool-2')).toBe(false);
    });

    it('should clear category indices', () => {
      service.registerTool(
        createMockToolDefinition('tool-1', ToolCategory.DATA),
        mockHandler,
      );

      service.clearAllTools();

      expect(service.getToolsByCategory(ToolCategory.DATA)).toHaveLength(0);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clean up without error', () => {
      service.registerTool(createMockToolDefinition('tool-1'), mockHandler);
      service.registerTool(createMockToolDefinition('tool-2'), mockHandler);

      expect(() => service.onModuleDestroy()).not.toThrow();
      expect(service.getToolCount()).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        service.onModuleDestroy();
        service.onModuleDestroy();
      }).not.toThrow();
    });
  });
});
