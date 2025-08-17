import { InputParser } from '../inputParser';
import { HandlerRegistry } from '../handlerRegistry';
import { CommandDefinition } from '../commandDefinitions';
import { SwitcherPlusSettings } from 'src/settings';
import { AnySuggestion, Mode, SuggestionType } from 'src/types';
import { Handler } from 'src/Handlers/handler';
import { mock, MockProxy, mockReset } from 'jest-mock-extended';
import { Chance } from 'chance';
import {
  editorTrigger,
  escapeCmdCharTrigger,
  headingsTrigger,
  makeInputInfo,
  relatedItemsTrigger,
  symbolTrigger,
} from '@fixtures';
import { App, WorkspaceLeaf } from 'obsidian';

const chance = new Chance();

class MockHandler extends Handler<AnySuggestion> {
  renderSuggestion = jest.fn();
  getCommandString = jest.fn();
  validateCommand = jest.fn();
  reset = jest.fn();
  validate = jest.fn();
  getSuggestions = jest.fn();
  onChooseSuggestion = jest.fn();
}

describe('InputParser', () => {
  let mockApp: MockProxy<App>;
  let mockHandlerRegistry: MockProxy<HandlerRegistry>;
  let mockConfig: MockProxy<SwitcherPlusSettings>;
  let mockCommandDefinitions: MockProxy<CommandDefinition>[];

  beforeAll(() => {
    mockApp = mock<App>();
    mockHandlerRegistry = mock<HandlerRegistry>();

    mockConfig = mock<SwitcherPlusSettings>({
      escapeCmdChar: escapeCmdCharTrigger,
    });
  });

  beforeEach(() => {
    mockCommandDefinitions = [
      mock<CommandDefinition>({
        mode: Mode.HeadingsList,
        handlerClass: MockHandler,
        ownSuggestionTypes: [SuggestionType.HeadingsList],
        parserCommand: {
          getCommandStr: () => headingsTrigger,
          type: 'prefix',
        },
      }),
      mock<CommandDefinition>({
        mode: Mode.EditorList,
        handlerClass: MockHandler,
        ownSuggestionTypes: [SuggestionType.EditorList],
        parserCommand: {
          getCommandStr: () => editorTrigger,
          type: 'prefix',
        },
      }),
      mock<CommandDefinition>({
        mode: Mode.SymbolList,
        handlerClass: MockHandler,
        ownSuggestionTypes: [SuggestionType.SymbolList],
        parserCommand: {
          getCommandStr: () => symbolTrigger,
          type: 'sourced',
        },
      }),
      mock<CommandDefinition>({
        mode: Mode.RelatedItemsList,
        handlerClass: MockHandler,
        ownSuggestionTypes: [SuggestionType.RelatedItemsList],
        parserCommand: {
          getCommandStr: () => relatedItemsTrigger,
          type: 'sourced',
        },
      }),
    ];
  });

  const createParser = () =>
    new InputParser(mockHandlerRegistry, mockConfig, mockCommandDefinitions);

  describe('parse', () => {
    test('should parse input with no commands', () => {
      const parser = createParser();
      const input = chance.sentence();

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toEqual([]);
    });

    test('should parse a simple command', () => {
      const parser = createParser();
      const filterText = chance.word();
      const input = symbolTrigger + filterText;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(1);
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.SymbolList);
      expect(result.resolvedCommands[0].filterText).toBe(filterText);
    });

    test('should parse a command with filter text', () => {
      const parser = createParser();
      const filterText = chance.sentence();
      const input = headingsTrigger + filterText;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(1);
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.HeadingsList);
      expect(result.resolvedCommands[0].filterText).toBe(filterText);
    });

    test('should treat an escaped command as literal text', () => {
      const parser = createParser();
      const filterText = chance.word();
      const cleanInput = symbolTrigger + filterText;
      const input = escapeCmdCharTrigger + cleanInput;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(cleanInput);
      expect(result.resolvedCommands).toEqual([]);
    });

    test('should parse multiple commands', () => {
      const parser = createParser();
      const input = `${headingsTrigger}heading1 ${symbolTrigger}symbol1`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(2);

      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.SymbolList);
      expect(result.resolvedCommands[0].filterText).toBe('symbol1');

      expect(result.resolvedCommands[1].cmdDef.mode).toBe(Mode.HeadingsList);
      expect(result.resolvedCommands[1].filterText).toBe(
        `heading1 ${symbolTrigger}symbol1`,
      );
    });

    test('should correctly match longer command triggers when commands overlap', () => {
      mockCommandDefinitions.push(
        mock<CommandDefinition>({
          mode: Mode.WorkspaceList,
          handlerClass: MockHandler,
          ownSuggestionTypes: [SuggestionType.WorkspaceList],
          parserCommand: {
            // Note: intentionally use overlapping trigger string for testing this mode
            getCommandStr: () => editorTrigger + editorTrigger,
            type: 'prefix',
          },
        }),
      );
      const parser = createParser();
      const input = `${editorTrigger}${editorTrigger}workspace using overlapping trigger`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(1);

      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.WorkspaceList);
      expect(result.resolvedCommands[0].cmdStr).toBe(`${editorTrigger}${editorTrigger}`);
      expect(result.resolvedCommands[0].filterText).toBe(
        'workspace using overlapping trigger',
      );
    });

    test('should resolve command precedence correctly (prefix vs sourced)', () => {
      const parser = createParser();
      const input = `${headingsTrigger}heading1${symbolTrigger}symbol1`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(2);

      // Sourced command comes first in precedence
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.SymbolList);
      expect(result.resolvedCommands[0].filterText).toBe('symbol1');

      // Prefix command comes second
      expect(result.resolvedCommands[1].cmdDef.mode).toBe(Mode.HeadingsList);
      expect(result.resolvedCommands[1].filterText).toBe(
        `heading1${symbolTrigger}symbol1`,
      );
    });

    test('should return empty result for empty input string', () => {
      const parser = createParser();

      const result = parser.parse('');

      expect(result.cleanInput).toBe('');
      expect(result.resolvedCommands).toEqual([]);
    });

    test('input with only escape characters should be treated as regular text', () => {
      const parser = createParser();

      const result = parser.parse(escapeCmdCharTrigger);

      expect(result.cleanInput).toBe(escapeCmdCharTrigger);
      expect(result.resolvedCommands).toEqual([]);
    });

    test('should not treat an invalid escaped sequence as an escaped command', () => {
      const parser = createParser();
      const input = `${escapeCmdCharTrigger}x`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toEqual([]);
    });

    test('should treat multiple escaped command triggers as literal text', () => {
      const parser = createParser();
      const cleanInput = `${symbolTrigger} ${headingsTrigger}`;
      const input = `${escapeCmdCharTrigger}${symbolTrigger} ${escapeCmdCharTrigger}${headingsTrigger}`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(cleanInput);
      expect(result.resolvedCommands).toEqual([]);
    });

    test('should correctly parse a command at the end of the input string', () => {
      const parser = createParser();
      const input = `${chance.sentence()} ${symbolTrigger}`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(1);
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.SymbolList);
      expect(result.resolvedCommands[0].filterText).toBe('');
    });

    test('should correctly parse a mix of escaped and unescaped commands', () => {
      const parser = createParser();
      const input = `${escapeCmdCharTrigger}${symbolTrigger} some text ${relatedItemsTrigger}`;

      const result = parser.parse(input);

      const cleanInput = `${symbolTrigger} some text ${relatedItemsTrigger}`;
      expect(result.cleanInput).toBe(cleanInput);
      expect(result.resolvedCommands).toHaveLength(1);
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.RelatedItemsList);
      expect(result.resolvedCommands[0].filterText).toBe('');
    });

    test('should correctly parse input that consists only of a command trigger', () => {
      const parser = createParser();
      const input = symbolTrigger;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(1);
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.SymbolList);
      expect(result.resolvedCommands[0].filterText).toBe('');
    });

    test('should prioritize the longer command when one is a substring of another', () => {
      mockCommandDefinitions.push(
        mock<CommandDefinition>({
          mode: Mode.VaultList,
          handlerClass: MockHandler,
          ownSuggestionTypes: [SuggestionType.VaultList],
          parserCommand: {
            getCommandStr: () => headingsTrigger.substring(0, 1),
            type: 'prefix',
          },
        }),
      );
      const parser = createParser();
      const input = `${headingsTrigger}heading`;

      const result = parser.parse(input);

      expect(result.cleanInput).toBe(input);
      expect(result.resolvedCommands).toHaveLength(1);
      expect(result.resolvedCommands[0].cmdDef.mode).toBe(Mode.HeadingsList);
      expect(result.resolvedCommands[0].filterText).toBe('heading');
    });
  });

  describe('parseInputForMode', () => {
    let mockActiveSugg: MockProxy<AnySuggestion>;
    let mockActiveLeaf: MockProxy<WorkspaceLeaf>;
    let mockHandler: MockHandler;

    beforeEach(() => {
      mockHandler = new MockHandler(mockApp, mockConfig);
      mockActiveSugg = mock<AnySuggestion>();
      mockActiveLeaf = mock<WorkspaceLeaf>();

      mockReset(mockHandlerRegistry);
    });

    test('should set mode to standard when no command is found', () => {
      const parser = createParser();
      const inputInfo = makeInputInfo({ inputText: 'not a command' });

      parser.parseInputForMode(inputInfo, mockActiveSugg, mockActiveLeaf);

      expect(inputInfo.mode).toBe(Mode.Standard);
    });

    test('should reset sourced handlers when no command is validated', () => {
      mockHandler.validateCommand.mockReturnValue({ isValidated: false });
      mockHandlerRegistry.getHandler.mockReturnValue(mockHandler);

      const parser = createParser();
      const inputInfo = makeInputInfo({ inputText: `${headingsTrigger}heading` });

      parser.parseInputForMode(inputInfo, mockActiveSugg, mockActiveLeaf);

      expect(mockHandlerRegistry.resetSourcedHandlers).toHaveBeenCalledWith();
      expect(inputInfo.mode).toBe(Mode.Standard);
    });

    test('should reset sourced handlers, excluding the validated handler, for a sourced command', () => {
      mockHandler.validateCommand.mockReturnValue({ isValidated: true });
      mockHandlerRegistry.getHandler.mockReturnValue(mockHandler);

      const parser = createParser();
      const inputInfo = makeInputInfo({ inputText: `${symbolTrigger}symbol` });

      parser.parseInputForMode(inputInfo, mockActiveSugg, mockActiveLeaf);

      expect(mockHandlerRegistry.resetSourcedHandlers).toHaveBeenCalledWith([
        mockHandler,
      ]);
    });

    test('should set useActiveEditorAsSource session option on inputInfo', () => {
      mockHandler.validateCommand.mockReturnValue({ isValidated: true });
      mockHandlerRegistry.getHandler.mockReturnValue(mockHandler);

      mockCommandDefinitions[0].parserCommand.useActiveEditorAsSource = true;

      const parser = createParser();
      const inputInfo = makeInputInfo({ inputText: `${headingsTrigger}heading` });

      parser.parseInputForMode(inputInfo, mockActiveSugg, mockActiveLeaf);

      expect(inputInfo.sessionOpts.useActiveEditorAsSource).toBe(true);
    });
  });
});
