import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Tool,
  ToolDefinition,
  ToolHandler,
  ToolCategory,
} from '../interfaces/tool.interface';
import { ToolDefinitionDto } from '../dto/tool-call.dto';
import { TOOL_DEFAULTS, TOOL_EVENTS } from '../constants/tool.constants';

/**
 * Tool registration options
 */
export interface ToolRegistrationOptions {
  /** Override existing tool with same name */
  override?: boolean;
}

/**
 * Tool registry store interface
 */
interface ToolRegistryStore {
  tools: Map<string, Tool>;
  categories: Map<ToolCategory, Set<string>>;
}

/**
 * Service responsible for managing tool registrations
 * Handles registration, lookup, and lifecycle of tools
 */
@Injectable()
export class ToolRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly store: ToolRegistryStore = {
    tools: new Map(),
    categories: new Map(),
  };

  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    this.initializeCategories();
  }

  onModuleDestroy(): void {
    this.clearAllTools();
  }

  /**
   * Initialize category sets
   */
  private initializeCategories(): void {
    for (const category of Object.values(ToolCategory)) {
      this.store.categories.set(category, new Set());
    }
  }

  /**
   * Register a new tool
   * @param definition - Tool definition
   * @param handler - Tool handler function
   * @param options - Registration options
   * @returns true if registration successful
   */
  registerTool<TParams = Record<string, unknown>, TResult = unknown>(
    definition: ToolDefinition,
    handler: ToolHandler<TParams, TResult>,
    options: ToolRegistrationOptions = {},
  ): boolean {
    const { override = false } = options;

    if (this.store.tools.has(definition.name) && !override) {
      this.logger.warn(
        `Tool "${definition.name}" already registered. Use override option to replace.`,
      );
      return false;
    }

    // Apply defaults
    const normalizedDefinition: ToolDefinition = {
      ...definition,
      category: definition.category ?? ToolCategory.CUSTOM,
      version: definition.version ?? TOOL_DEFAULTS.DEFAULT_VERSION,
      timeout: definition.timeout ?? TOOL_DEFAULTS.EXECUTION_TIMEOUT_MS,
    };

    const tool: Tool<TParams, TResult> = {
      definition: normalizedDefinition,
      handler,
    };

    // Remove from old category if overriding
    if (override && this.store.tools.has(definition.name)) {
      const existingTool = this.store.tools.get(definition.name);
      if (existingTool?.definition.category) {
        this.store.categories
          .get(existingTool.definition.category)
          ?.delete(definition.name);
      }
    }

    this.store.tools.set(definition.name, tool as Tool);

    // Add to category index
    const category = normalizedDefinition.category!;
    this.store.categories.get(category)?.add(definition.name);

    this.logger.log(
      `Tool registered: ${definition.name} (category: ${category})`,
    );

    this.eventEmitter?.emit(TOOL_EVENTS.TOOL_REGISTERED, {
      toolName: definition.name,
      category,
    });

    return true;
  }

  /**
   * Register multiple tools at once
   * @param tools - Array of tool configurations
   * @returns Number of successfully registered tools
   */
  registerTools(
    tools: Array<{ definition: ToolDefinition; handler: ToolHandler }>,
    options: ToolRegistrationOptions = {},
  ): number {
    let registered = 0;
    for (const { definition, handler } of tools) {
      if (this.registerTool(definition, handler, options)) {
        registered++;
      }
    }
    return registered;
  }

  /**
   * Unregister a tool by name
   * @param toolName - Name of the tool to unregister
   * @returns true if tool was removed
   */
  unregisterTool(toolName: string): boolean {
    const tool = this.store.tools.get(toolName);
    if (!tool) {
      return false;
    }

    // Remove from category index
    if (tool.definition.category) {
      this.store.categories.get(tool.definition.category)?.delete(toolName);
    }

    this.store.tools.delete(toolName);

    this.logger.log(`Tool unregistered: ${toolName}`);

    this.eventEmitter?.emit(TOOL_EVENTS.TOOL_UNREGISTERED, {
      toolName,
    });

    return true;
  }

  /**
   * Get a tool by name
   * @param toolName - Name of the tool
   * @returns Tool or null if not found
   */
  getTool<TParams = Record<string, unknown>, TResult = unknown>(
    toolName: string,
  ): Tool<TParams, TResult> | null {
    const tool = this.store.tools.get(toolName);
    if (!tool) {
      return null;
    }

    // Don't return deprecated tools (but log a warning)
    if (tool.definition.deprecated) {
      this.logger.warn(`Tool "${toolName}" is deprecated`);
    }

    return tool as Tool<TParams, TResult>;
  }

  /**
   * Get tool definition by name
   * @param toolName - Name of the tool
   * @returns Tool definition or null
   */
  getToolDefinition(toolName: string): ToolDefinition | null {
    return this.store.tools.get(toolName)?.definition ?? null;
  }

  /**
   * Check if a tool exists
   * @param toolName - Name of the tool
   */
  hasTool(toolName: string): boolean {
    return this.store.tools.has(toolName);
  }

  /**
   * Get all registered tools
   * @param includeDeprecated - Include deprecated tools
   */
  getAllTools(includeDeprecated = false): Tool[] {
    const tools: Tool[] = [];
    for (const tool of this.store.tools.values()) {
      if (!includeDeprecated && tool.definition.deprecated) {
        continue;
      }
      tools.push(tool);
    }
    return tools;
  }

  /**
   * Get all tool definitions
   * @param includeDeprecated - Include deprecated tools
   */
  getAllToolDefinitions(includeDeprecated = false): ToolDefinition[] {
    return this.getAllTools(includeDeprecated).map((t) => t.definition);
  }

  /**
   * Get tool definitions as DTOs
   * @param includeDeprecated - Include deprecated tools
   */
  getToolDefinitionDtos(includeDeprecated = false): ToolDefinitionDto[] {
    return this.getAllToolDefinitions(includeDeprecated).map(
      (def) =>
        new ToolDefinitionDto(
          def.name,
          def.description,
          def.parameters,
          def.category,
          def.version,
          def.deprecated,
        ),
    );
  }

  /**
   * Get tools by category
   * @param category - Tool category
   */
  getToolsByCategory(category: ToolCategory): Tool[] {
    const toolNames = this.store.categories.get(category);
    if (!toolNames) {
      return [];
    }

    const tools: Tool[] = [];
    for (const name of toolNames) {
      const tool = this.store.tools.get(name);
      if (tool && !tool.definition.deprecated) {
        tools.push(tool);
      }
    }
    return tools;
  }

  /**
   * Get total number of registered tools
   * @param includeDeprecated - Include deprecated tools in count
   */
  getToolCount(includeDeprecated = false): number {
    if (includeDeprecated) {
      return this.store.tools.size;
    }

    let count = 0;
    for (const tool of this.store.tools.values()) {
      if (!tool.definition.deprecated) {
        count++;
      }
    }
    return count;
  }

  /**
   * Search tools by name or description
   * @param query - Search query
   */
  searchTools(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    const results: Tool[] = [];

    for (const tool of this.store.tools.values()) {
      if (tool.definition.deprecated) {
        continue;
      }

      const nameMatch = tool.definition.name.toLowerCase().includes(lowerQuery);
      const descMatch = tool.definition.description
        .toLowerCase()
        .includes(lowerQuery);

      if (nameMatch || descMatch) {
        results.push(tool);
      }
    }

    return results;
  }

  /**
   * Clear all registered tools
   */
  clearAllTools(): void {
    this.store.tools.clear();
    for (const category of this.store.categories.values()) {
      category.clear();
    }
    this.logger.log('All tools cleared');
  }
}
