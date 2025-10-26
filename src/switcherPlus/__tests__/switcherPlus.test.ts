import SwitcherPlusPlugin from 'src/main';
import { createSwitcherPlus, HandlerRegistry, ModeHandler } from 'src/switcherPlus';
import { getSystemSwitcherInstance } from 'src/utils';
import { mock, mockClear, mockFn, MockProxy } from 'jest-mock-extended';
import { App, Chooser, Platform, QuickSwitcherPluginInstance, Scope } from 'obsidian';
import { Chance } from 'chance';
import { SwitcherPlusSettings } from 'src/settings';
import {
  AnySuggestion,
  Mode,
  SwitcherPlus,
  EditorSuggestion,
  SessionOpts,
} from 'src/types';

jest.mock('src/switcherPlus/switcherPlusKeymap');
jest.mock('src/utils', () => {
  return {
    __esModule: true,
    ...jest.requireActual<typeof import('src/utils')>('src/utils'),

    // This needs to be mocked since at test time access to the actual Obsidian builtin
    // system switcher is not available.
    getSystemSwitcherInstance: jest.fn(),
  };
});

const chance = new Chance();
const mockChooser = mock<Chooser<AnySuggestion>>();
const mockScope = mock<Scope>({ keys: [] });
const mockModalEl = mock<HTMLElement>({
  createDiv: jest.fn(),
});

class MockSystemSwitcherModal {
  protected chooser: Chooser<AnySuggestion>;
  scope: Scope;
  modalEl: HTMLElement;
  inputEl: HTMLInputElement;
  app: App;

  constructor(app: App) {
    this.app = app;
    this.chooser = mockChooser;
    this.scope = mockScope;
    this.modalEl = mockModalEl;
  }
  updateSuggestions(): void {
    /* noop */
  }
  renderSuggestion(_value: AnySuggestion, _el: HTMLElement): void {
    /* noop */
  }
  getSuggestions(_input: string): AnySuggestion[] {
    throw new Error('Not implemented');
  }
  onChooseSuggestion(_item: AnySuggestion, _evt: MouseEvent | KeyboardEvent): void {
    /* noop */
  }
  open(): void {
    this.updateSuggestions();
  }
  onOpen(): void {
    /* noop */
  }
  close(): void {
    /* noop */
  }
  onClose(): void {
    /* noop */
  }
}

describe('switcherPlus', () => {
  let mockApp: MockProxy<App>;
  let mockPlugin: MockProxy<SwitcherPlusPlugin>;

  // mock version of the built in system Switcher plugin instance
  // QuickSwitcherModal is the Class that SwitcherPlus inherits from, so set
  // that to the mock class from above
  const mockSystemSwitcherPluginInstance = mock<QuickSwitcherPluginInstance>({
    QuickSwitcherModal: MockSystemSwitcherModal,
  });

  // mock of utils function that retrieves the builtin switcher plugin instance
  // defaults to returning the mocked version of the plugin instance
  const mockGetSystemSwitcherInstance = jest
    .mocked(getSystemSwitcherInstance)
    .mockReturnValue(mockSystemSwitcherPluginInstance);

  beforeAll(() => {
    mockApp = mock<App>();
    mockPlugin = mock<SwitcherPlusPlugin>({ app: mockApp });

    // Setup mocks for commands and hotkey manager
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    mockApp.commands = {
      listCommands: jest.fn(),
      executeCommandById: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    mockApp.hotkeyManager = {
      getHotkeys: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const config = new SwitcherPlusSettings(mockPlugin);
    mockPlugin.options = config;

    // Disable these two setting so that state isn't store between tests
    config.preserveCommandPaletteLastInput = false;
    config.preserveQuickSwitcherLastInput = false;
  });

  describe('createSwitcherPlus', () => {
    it('should log error to the console if the builtin QuickSwitcherModal is not accessible', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockReturnValueOnce();

      mockGetSystemSwitcherInstance.mockReturnValueOnce(null);

      const result = createSwitcherPlus(mockApp, mockPlugin);

      expect(result).toBeNull();
      expect(mockGetSystemSwitcherInstance).toHaveBeenCalledWith(mockApp);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Switcher++: unable to extend system switcher. Plugin UI will not be loaded.',
        ),
      );

      consoleLogSpy.mockRestore();
    });

    it('should return an instance of a class that implements SwitcherPlus', () => {
      const result = createSwitcherPlus(mockApp, mockPlugin);

      // todo: more thorough checking needed here
      expect(result).not.toBeFalsy();
      expect(mockGetSystemSwitcherInstance).toHaveBeenLastCalledWith(mockApp);
    });
  });

  describe('SwitcherPlusModal', () => {
    let sut: SwitcherPlus;

    beforeAll(() => {
      HandlerRegistry.reset();
      sut = createSwitcherPlus(mockApp, mockPlugin);
    });

    test('openInMode() should forward to ModeHandler and  call super.Open()', () => {
      const opts = mock<SessionOpts>({ mode: Mode.EditorList });
      const setSessionOpenModeSpy = jest.spyOn(
        ModeHandler.prototype,
        'setSessionOpenMode',
      );

      const superOpenSpy = jest
        .spyOn(MockSystemSwitcherModal.prototype, 'open')
        .mockReturnValueOnce();

      sut.openInMode(opts);

      expect(setSessionOpenModeSpy).toHaveBeenCalledWith(mockChooser, opts);
      expect(superOpenSpy).toHaveBeenCalled();

      setSessionOpenModeSpy.mockReset();
      superOpenSpy.mockRestore();
    });

    test('onOpen() should forward to ModeHandler and call super.onOpen()', () => {
      const mhOnOpenSpy = jest.spyOn(ModeHandler.prototype, 'onOpen').mockReturnValue();

      const superOnOpenSpy = jest.spyOn(MockSystemSwitcherModal.prototype, 'onOpen');

      window.addEventListener =
        mockFn<(typeof window)['addEventListener']>().mockReturnValue();

      sut.onOpen();

      expect(mhOnOpenSpy).toHaveBeenCalled();
      expect(superOnOpenSpy).toHaveBeenCalled();
      expect(window.addEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        {
          capture: true,
        },
      );

      mhOnOpenSpy.mockReset();
      superOnOpenSpy.mockRestore();
    });

    test('onClose() should forward to ModeHandler and call super.onClose()', () => {
      const mhOnCloseSpy = jest.spyOn(ModeHandler.prototype, 'onClose');

      const superOnCloseSpy = jest.spyOn(MockSystemSwitcherModal.prototype, 'onClose');

      window.addEventListener =
        mockFn<(typeof window)['addEventListener']>().mockReturnValue();
      window.removeEventListener =
        mockFn<(typeof window)['removeEventListener']>().mockReturnValue();

      sut.onOpen();
      sut.onClose();

      expect(mhOnCloseSpy).toHaveBeenCalled();
      expect(superOnCloseSpy).toHaveBeenCalled();
      expect(window.removeEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        {
          capture: true,
        },
      );

      mhOnCloseSpy.mockReset();
      superOnCloseSpy.mockRestore();
    });

    it('should forward to ModeHandler to get suggestions', () => {
      const insertCmdStringSpy = jest
        .spyOn(ModeHandler.prototype, 'setInitialInputForSession')
        .mockReturnValueOnce();

      const mhUpdateSuggestionsSpy = jest
        .spyOn(ModeHandler.prototype, 'updateSuggestions')
        .mockReturnValue(true); // true to signify that ModeHandler handled it

      const superUpdateSuggestionsSpy = jest.spyOn(
        MockSystemSwitcherModal.prototype,
        'updateSuggestions',
      );

      const inputText = 'foo';
      const mockInputEl = mock<HTMLInputElement>({ value: inputText });
      sut.inputEl = mockInputEl;

      // internally calls updateSuggestions()
      sut.open();

      expect(insertCmdStringSpy).toHaveBeenCalledWith(mockInputEl);
      expect(mhUpdateSuggestionsSpy).toHaveBeenCalledWith(inputText, mockChooser, sut);

      // expect to not get called because ModeHandler should have handled it
      expect(superUpdateSuggestionsSpy).not.toHaveBeenCalled();

      insertCmdStringSpy.mockReset();
      mhUpdateSuggestionsSpy.mockReset();
      superUpdateSuggestionsSpy.mockRestore();
      mockClear(sut.inputEl);
    });

    it('should forward to builtin system switcher if not handled by Modehandler', () => {
      const insertCmdStringSpy = jest.spyOn(
        ModeHandler.prototype,
        'setInitialInputForSession',
      );

      const mhUpdateSuggestionsSpy = jest
        .spyOn(ModeHandler.prototype, 'updateSuggestions')
        .mockReturnValue(false); // false to signify that ModeHandler did not handled it

      const superUpdateSuggestionsSpy = jest.spyOn(
        MockSystemSwitcherModal.prototype,
        'updateSuggestions',
      );

      const inputText = 'foo';
      const mockInputEl = mock<HTMLInputElement>({ value: inputText });
      sut.inputEl = mockInputEl;

      // internally calls updateSuggestions()
      sut.open();

      expect(insertCmdStringSpy).toHaveBeenCalledWith(mockInputEl);
      expect(mhUpdateSuggestionsSpy).toHaveBeenCalledWith(inputText, mockChooser, sut);

      // expect to get called because ModeHandler did not handle it
      expect(superUpdateSuggestionsSpy).toHaveBeenCalled();

      insertCmdStringSpy.mockReset();
      mhUpdateSuggestionsSpy.mockReset();
      superUpdateSuggestionsSpy.mockRestore();
      mockClear(sut.inputEl);
    });

    test('onChooseSuggestion() should forward to ModeHandler', () => {
      const mhOnChooseSuggestionSpy = jest
        .spyOn(ModeHandler.prototype, 'onChooseSuggestion')
        .mockReturnValue(true); // true to signify that ModeHandler handled it

      const superOnChooseSuggestionSpy = jest.spyOn(
        MockSystemSwitcherModal.prototype,
        'onChooseSuggestion',
      );

      const mockSugg = mock<EditorSuggestion>();
      const mockEvt = mock<MouseEvent>();

      sut.onChooseSuggestion(mockSugg, mockEvt);

      expect(mhOnChooseSuggestionSpy).toHaveBeenCalledWith(mockSugg, mockEvt);

      // expect to not get called because ModeHandler should have handled it
      expect(superOnChooseSuggestionSpy).not.toHaveBeenCalled();

      mhOnChooseSuggestionSpy.mockReset();
      superOnChooseSuggestionSpy.mockRestore();
    });

    test('onChooseSuggestion() should forward to builtin system switcher if not handled by ModeHandler', () => {
      const mhOnChooseSuggestionSpy = jest
        .spyOn(ModeHandler.prototype, 'onChooseSuggestion')
        .mockReturnValue(false); // false to signify that ModeHandler did not handled it

      const superOnChooseSuggestionSpy = jest.spyOn(
        MockSystemSwitcherModal.prototype,
        'onChooseSuggestion',
      );

      const mockSugg = mock<EditorSuggestion>();
      const mockEvt = mock<MouseEvent>();

      sut.onChooseSuggestion(mockSugg, mockEvt);

      expect(mhOnChooseSuggestionSpy).toHaveBeenCalledWith(mockSugg, mockEvt);

      // expect to get called because ModeHandler did not handle it
      expect(superOnChooseSuggestionSpy).toHaveBeenCalledWith(mockSugg, mockEvt);

      mhOnChooseSuggestionSpy.mockReset();
      superOnChooseSuggestionSpy.mockRestore();
    });

    test('renderSuggestion() should forward to ModeHandler', () => {
      const mhRenderSuggestionSpy = jest
        .spyOn(ModeHandler.prototype, 'renderSuggestion')
        .mockReturnValue(true); // true to signify that ModeHandler handled it

      const superRenderSuggestionSpy = jest.spyOn(
        MockSystemSwitcherModal.prototype,
        'renderSuggestion',
      );

      const mockSugg = mock<EditorSuggestion>();
      const mockEl = mock<HTMLElement>();

      sut.renderSuggestion(mockSugg, mockEl);

      expect(mhRenderSuggestionSpy).toHaveBeenCalledWith(mockSugg, mockEl);

      // expect to not get called because ModeHandler should have handled it
      expect(superRenderSuggestionSpy).not.toHaveBeenCalled();

      mhRenderSuggestionSpy.mockReset();
      superRenderSuggestionSpy.mockRestore();
    });

    test('renderSuggestion() should forward to builtin system switcher if not handled by ModeHandler', () => {
      const mhRenderSuggestionSpy = jest
        .spyOn(ModeHandler.prototype, 'renderSuggestion')
        .mockReturnValue(false); // false to signify that ModeHandler did not handled it

      const superRenderSuggestionSpy = jest.spyOn(
        MockSystemSwitcherModal.prototype,
        'renderSuggestion',
      );

      const mockSugg = mock<EditorSuggestion>();
      const mockEl = mock<HTMLElement>();

      sut.renderSuggestion(mockSugg, mockEl);

      expect(mhRenderSuggestionSpy).toHaveBeenCalledWith(mockSugg, mockEl);

      // expect to get called because ModeHandler did not handle it
      expect(superRenderSuggestionSpy).toHaveBeenCalledWith(mockSugg, mockEl);

      mhRenderSuggestionSpy.mockReset();
      superRenderSuggestionSpy.mockRestore();
    });

    test('getSuggestions() should retrieve parsed input from ModeHandler in standard mode', () => {
      const expectedInput = chance.word();
      const superGetSuggestionSpy = jest
        .spyOn(MockSystemSwitcherModal.prototype, 'getSuggestions')
        .mockReturnValueOnce(null);

      sut.getSuggestions(expectedInput);

      expect(superGetSuggestionSpy).toHaveBeenCalledWith(expectedInput);

      superGetSuggestionSpy.mockRestore();
    });

    describe('handleGlobalHotkey', () => {
      const createMockKeyboardEvent = (
        key: string,
        modifiers: {
          ctrlKey?: boolean;
          metaKey?: boolean;
          altKey?: boolean;
          shiftKey?: boolean;
        } = {},
      ) => {
        return {
          key,
          ctrlKey: modifiers.ctrlKey || false,
          metaKey: modifiers.metaKey || false,
          altKey: modifiers.altKey || false,
          shiftKey: modifiers.shiftKey || false,
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
        } as unknown as KeyboardEvent;
      };

      beforeEach(() => {
        window.addEventListener = jest.fn();
        window.removeEventListener = jest.fn();
      });

      test('should execute command when hotkey matches with single key', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: [], key: 'k' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        // Capture the event handler
        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        // Create a keyboard event
        const evt = createMockKeyboardEvent('k');

        const preventDefaultSpy = jest.spyOn(evt, 'preventDefault');
        const stopPropagationSpy = jest.spyOn(evt, 'stopPropagation');
        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        // Call the handler
        keydownHandler?.(evt);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(stopPropagationSpy).toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalled();
        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId);

        preventDefaultSpy.mockRestore();
        stopPropagationSpy.mockRestore();
        closeSpy.mockRestore();
      });

      test('should execute command when hotkey matches with modifiers', () => {
        const commandId = 'test-command-with-mods';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: ['Ctrl', 'Shift'], key: 'p' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('p', { ctrlKey: true, shiftKey: true });

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(closeSpy).toHaveBeenCalled();
        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId);

        closeSpy.mockRestore();
      });

      test('should handle Mod modifier on macOS', () => {
        const originalPlatform = Object.getOwnPropertyDescriptor(Platform, 'isMacOS');
        Object.defineProperty(Platform, 'isMacOS', { value: true, configurable: true });

        const commandId = 'test-command-mod';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: ['Mod'], key: 'k' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k', { metaKey: true });

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId);

        closeSpy.mockRestore();
        if (originalPlatform) {
          Object.defineProperty(Platform, 'isMacOS', originalPlatform);
        }
      });

      test('should handle Mod modifier on Windows/Linux', () => {
        const originalPlatform = Object.getOwnPropertyDescriptor(Platform, 'isMacOS');
        Object.defineProperty(Platform, 'isMacOS', { value: false, configurable: true });

        const commandId = 'test-command-mod';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: ['Mod'], key: 'k' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k', { ctrlKey: true });

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId);

        closeSpy.mockRestore();
        if (originalPlatform) {
          Object.defineProperty(Platform, 'isMacOS', originalPlatform);
        }
      });

      test('should not execute command when key does not match', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: [], key: 'k' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('j');

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(closeSpy).not.toHaveBeenCalled();
        expect(mockApp.commands.executeCommandById).not.toHaveBeenCalled();

        closeSpy.mockRestore();
      });

      test('should not execute command when modifiers do not match', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: ['Ctrl'], key: 'k' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k');

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(closeSpy).not.toHaveBeenCalled();
        expect(mockApp.commands.executeCommandById).not.toHaveBeenCalled();

        closeSpy.mockRestore();
      });

      test('should handle commands with no hotkeys', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue(null);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k');

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(closeSpy).not.toHaveBeenCalled();
        expect(mockApp.commands.executeCommandById).not.toHaveBeenCalled();

        closeSpy.mockRestore();
      });

      test('should handle commands with non-array hotkeys', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue(
          'invalid' as unknown,
        );
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k');

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(closeSpy).not.toHaveBeenCalled();
        expect(mockApp.commands.executeCommandById).not.toHaveBeenCalled();

        closeSpy.mockRestore();
      });

      test('should handle multiple commands and find the matching one', () => {
        const commandId1 = 'test-command-1';
        const commandId2 = 'test-command-2';
        const mockCommands = [
          { id: commandId1, name: 'Test Command 1' },
          { id: commandId2, name: 'Test Command 2' },
        ];

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue(mockCommands);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock)
          .mockReturnValueOnce([{ modifiers: ['Ctrl'], key: 'a' }])
          .mockReturnValueOnce([{ modifiers: ['Ctrl'], key: 'b' }]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('b', { ctrlKey: true });

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId2);

        closeSpy.mockRestore();
      });

      test('should handle case-insensitive key matching', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: [], key: 'K' }, // Uppercase
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k');

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId);

        closeSpy.mockRestore();
      });

      test('should handle all modifier combinations', () => {
        const commandId = 'test-command';
        const mockCommand = {
          id: commandId,
          name: 'Test Command',
        };

        (mockApp.commands.listCommands as jest.Mock).mockReturnValue([mockCommand]);
        (mockApp.hotkeyManager.getHotkeys as jest.Mock).mockReturnValue([
          { modifiers: ['Ctrl', 'Meta', 'Alt', 'Shift'], key: 'k' },
        ]);
        mockApp.commands.executeCommandById = jest.fn();

        let keydownHandler: ((evt: KeyboardEvent) => void) | undefined;
        (window.addEventListener as jest.Mock).mockImplementation(
          (event: string, handler: (evt: KeyboardEvent) => void) => {
            if (event === 'keydown') {
              keydownHandler = handler;
            }
          },
        );

        sut.onOpen();

        const evt = createMockKeyboardEvent('k', {
          ctrlKey: true,
          metaKey: true,
          altKey: true,
          shiftKey: true,
        });

        const closeSpy = jest.spyOn(sut, 'close').mockImplementation();

        keydownHandler?.(evt);

        expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith(commandId);

        closeSpy.mockRestore();
      });
    });
  });
});
