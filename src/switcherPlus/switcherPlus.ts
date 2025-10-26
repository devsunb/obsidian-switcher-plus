import { SwitcherPlusKeymap } from './switcherPlusKeymap';
import { getSystemSwitcherInstance } from 'src/utils';
import { ModeHandler } from './modeHandler';
import SwitcherPlusPlugin from 'src/main';
import { App, QuickSwitcherOptions, Platform, Hotkey } from 'obsidian';
import {
  SystemSwitcher,
  SwitcherPlus,
  AnySuggestion,
  SessionOpts,
  ModeDispatcher,
} from 'src/types';

interface SystemSwitcherConstructor extends SystemSwitcher {
  new (app: App, builtInOptions: QuickSwitcherOptions): SystemSwitcher;
}

export function createSwitcherPlus(app: App, plugin: SwitcherPlusPlugin): SwitcherPlus {
  const SystemSwitcherModal = getSystemSwitcherInstance(app)
    ?.QuickSwitcherModal as SystemSwitcherConstructor;

  if (!SystemSwitcherModal) {
    console.log(
      'Switcher++: unable to extend system switcher. Plugin UI will not be loaded. Use the builtin switcher instead.',
    );
    return null;
  }

  const SwitcherPlusModal = class extends SystemSwitcherModal implements SwitcherPlus {
    private _exMode: ModeDispatcher;
    private globalHotkeyHandler: (evt: KeyboardEvent) => void;

    get exMode(): ModeDispatcher {
      return this._exMode;
    }

    constructor(
      app: App,
      public plugin: SwitcherPlusPlugin,
    ) {
      super(app, plugin.options.builtInSystemOptions);

      const { options } = plugin;
      options.shouldShowAlias = this.shouldShowAlias;
      const exKeymap = new SwitcherPlusKeymap(
        app,
        this.scope,
        this.chooser,
        this,
        options,
      );
      this._exMode = new ModeHandler(app, options, exKeymap);
    }

    openInMode(sessionOpts: SessionOpts): void {
      this.exMode.setSessionOpenMode(this.chooser, sessionOpts);
      super.open();
    }

    onOpen(): void {
      this.exMode.onOpen();

      // Register global hotkey handler to allow Obsidian hotkeys while modal is open
      this.globalHotkeyHandler = this.handleGlobalHotkey.bind(this);
      window.addEventListener('keydown', this.globalHotkeyHandler, { capture: true });

      // This call hard codes this.inputEl to an empty string, and calls updateSuggestions()
      super.onOpen();
    }

    onClose() {
      // Remove global hotkey handler
      if (this.globalHotkeyHandler) {
        window.removeEventListener('keydown', this.globalHotkeyHandler, {
          capture: true,
        });
      }

      super.onClose();
      this.exMode.onClose();
    }

    protected updateSuggestions(): void {
      const { exMode, inputEl, chooser } = this;
      exMode.setInitialInputForSession(inputEl);

      if (!exMode.updateSuggestions(inputEl.value, chooser, this)) {
        super.updateSuggestions();
      }
    }

    getSuggestions(input: string): AnySuggestion[] {
      const { exMode, plugin } = this;
      const query = exMode.inputTextForStandardMode(input);
      const results = super.getSuggestions(query);
      exMode.addPropertiesToStandardSuggestions(results, plugin.options);
      return results;
    }

    onChooseSuggestion(item: AnySuggestion, evt: MouseEvent | KeyboardEvent) {
      if (!this.exMode.onChooseSuggestion(item, evt)) {
        super.onChooseSuggestion(item, evt);
      }
    }

    renderSuggestion(value: AnySuggestion, parentEl: HTMLElement) {
      if (!this.exMode.renderSuggestion(value, parentEl)) {
        super.renderSuggestion(value, parentEl);
      }
    }

    /**
     * Handles global hotkey events when the modal is open.
     * Checks if the pressed key combination matches any Obsidian command hotkey
     * and executes the command if found.
     */
    private handleGlobalHotkey(evt: KeyboardEvent): void {
      const { app } = this;
      const commands = app.commands.listCommands();

      // Build modifier list from event
      const modifiers: string[] = [];
      if (evt.ctrlKey) modifiers.push('Ctrl');
      if (evt.metaKey) modifiers.push('Meta');
      if (evt.altKey) modifiers.push('Alt');
      if (evt.shiftKey) modifiers.push('Shift');

      // Check each command to see if it matches the current key combination
      for (const command of commands) {
        const hotkeys = app.hotkeyManager.getHotkeys(command.id);

        // Check if hotkeys is valid and iterable
        if (!hotkeys || !Array.isArray(hotkeys)) {
          continue;
        }

        for (const hotkey of hotkeys) {
          if (this.hotkeyMatches(hotkey, evt, modifiers)) {
            // Prevent default and stop propagation to avoid double execution
            evt.preventDefault();
            evt.stopPropagation();

            // Close the modal before executing the command
            this.close();

            // Execute the command
            app.commands.executeCommandById(command.id);
            return;
          }
        }
      }
    }

    /**
     * Checks if a hotkey matches the current keyboard event.
     *
     * @param hotkey The hotkey to check
     * @param evt The keyboard event
     * @param modifiers The modifier keys from the event
     * @returns true if the hotkey matches the event
     */
    private hotkeyMatches(
      hotkey: Hotkey,
      evt: KeyboardEvent,
      modifiers: string[],
    ): boolean {
      // Compare key (case-insensitive)
      if (hotkey.key.toLowerCase() !== evt.key.toLowerCase()) {
        return false;
      }

      // Get hotkey modifiers and normalize 'Mod' to platform-specific key
      const hotkeyModifiers = (hotkey.modifiers || []).map((mod) => {
        if (mod === 'Mod') {
          return Platform.isMacOS ? 'Meta' : 'Ctrl';
        }
        return mod;
      });

      // Compare modifier count
      if (hotkeyModifiers.length !== modifiers.length) {
        return false;
      }

      // Sort and compare modifiers
      const sortedHotkeyMods = [...hotkeyModifiers].sort();
      const sortedEventMods = [...modifiers].sort();

      for (let i = 0; i < sortedHotkeyMods.length; i++) {
        if (sortedHotkeyMods[i] !== sortedEventMods[i]) {
          return false;
        }
      }

      return true;
    }
  };

  return new SwitcherPlusModal(app, plugin);
}
