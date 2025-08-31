import { Mode } from 'src/types';
import {
  editorTrigger,
  symbolTrigger,
  workspaceTrigger,
  headingsTrigger,
  commandTrigger,
  relatedItemsTrigger,
  bookmarksTrigger,
  escapeCmdCharTrigger,
  vaultTrigger,
} from './modeTrigger.fixture';

interface InputExpectation {
  input: string;
  expected: {
    mode: Mode;
    isValidated: boolean;
    parsedInput: string;
  };
}

const triggerMap = new Map<Mode, string>([
  [Mode.CommandList, commandTrigger],
  [Mode.EditorList, editorTrigger],
  [Mode.HeadingsList, headingsTrigger],
  [Mode.RelatedItemsList, relatedItemsTrigger],
  [Mode.BookmarksList, bookmarksTrigger],
  [Mode.SymbolList, symbolTrigger],
  [Mode.WorkspaceList, workspaceTrigger],
  [Mode.VaultList, vaultTrigger],
]);

export function makeInputExpectation(
  input: string,
  mode: Mode,
  expectedParsedInput?: string,
  isValidated = true,
): InputExpectation {
  return {
    input,
    expected: {
      mode,
      isValidated,
      parsedInput: expectedParsedInput,
    },
  };
}

function standardExpectation(input: string): InputExpectation {
  return makeInputExpectation(input, Mode.Standard, input, false);
}

export const standardModeInputFixture = [
  // A standard string with no command triggers
  standardExpectation('test string'),
  // Prefix triggers are ignored if not at the start of the input
  standardExpectation(` ${editorTrigger}test string`),
  standardExpectation(`test${headingsTrigger}string`),
  // Sourced triggers can appear anywhere, but these tests assume they will fail validation
  // and fall back to standard mode.
  standardExpectation(`${symbolTrigger}test string: No active editor or suggestion`),
  standardExpectation(`test ${symbolTrigger}string: No active editor or suggestion`),
  standardExpectation(`bar ${symbolTrigger} foo`),
  // Multiple triggers in one input
  standardExpectation(`     ${workspaceTrigger}test string ${editorTrigger}`),
  standardExpectation(`bar${symbolTrigger}foo${symbolTrigger}`),
];

export const unicodeInputFixture = [
  {
    editorTrigger: 'ë',
    input: 'ëfooô',
    expected: { mode: Mode.EditorList, parsedInput: 'fooô' },
  },
  {
    editorTrigger: '☃',
    input: '☃fooô',
    expected: { mode: Mode.EditorList, parsedInput: 'fooô' },
  },
  {
    symbolTrigger: 'n̂',
    input: 'n̂fooô',
    expected: { mode: Mode.SymbolList, parsedInput: 'fooô' },
  },
  {
    symbolTrigger: '👨‍👩‍👧‍👦',
    input: '👨‍👩‍👧‍👦fooô',
    expected: { mode: Mode.SymbolList, parsedInput: 'fooô' },
  },
  {
    editorTrigger: '깍',
    symbolTrigger: '💩',
    input: '깍foo💩barô',
    expected: { mode: Mode.SymbolList, parsedInput: 'barô' },
  },
];

// Used for tests with active leaf only (no suggestions)
export function makePrefixOnlyInputFixture(triggerMode: Mode): InputExpectation[] {
  const trigger = triggerMap.get(triggerMode);

  return [
    // No filter text
    makeInputExpectation(`${trigger}`, triggerMode, ''),
    // Plain filter text
    makeInputExpectation(`${trigger}test string`, triggerMode, 'test string'),
    // Filter text containing a sourced command trigger
    makeInputExpectation(
      `${trigger} ${symbolTrigger}foo`,
      triggerMode,
      ` ${symbolTrigger}foo`,
    ),
    // Filter text containing multiple sourced command triggers
    makeInputExpectation(
      `${trigger}bar${symbolTrigger}foo${symbolTrigger}`,
      triggerMode,
      `bar${symbolTrigger}foo${symbolTrigger}`,
    ),
  ];
}

// Used for tests with different types of suggestions (File, Editor)
export function makeSourcedCmdEmbeddedInputFixture(
  triggerMode: Mode,
): InputExpectation[] {
  const trigger = triggerMap.get(triggerMode);

  return [
    // Sourced command at the start
    makeInputExpectation(`${trigger}foo`, triggerMode, 'foo'),
    // Sourced command with leading space
    makeInputExpectation(` ${trigger} foo`, triggerMode, ' foo'),
    // Sourced command embedded in text
    makeInputExpectation(`bar${trigger}foo`, triggerMode, 'foo'),
    // Sourced command at the end of the text
    makeInputExpectation(`bar ${trigger}`, triggerMode, ''),
    // Interaction with a prefix command (sourced command should win)
    makeInputExpectation(`${editorTrigger}bar${trigger}foo`, triggerMode, 'foo'),
    // Interaction with another sourced command
    makeInputExpectation(
      `bar${trigger}foo${relatedItemsTrigger}baz`,
      triggerMode,
      `foo${relatedItemsTrigger}baz`,
    ),
    // Complex characters
    makeInputExpectation(`bar!${trigger}*foo`, triggerMode, '*foo'),
  ];
}

/**
 * Creates an array of standard mode expectations with command escape characters
 * @returns InputExpectation[]
 */
export function makeEscapedStandardModeInputFixture(): InputExpectation[] {
  return [
    // Multiple escaped commands, spaces, and repetition
    makeInputExpectation(
      `${escapeCmdCharTrigger}${headingsTrigger} ${escapeCmdCharTrigger}${symbolTrigger}bar${escapeCmdCharTrigger}${symbolTrigger}`,
      Mode.Standard,
      `${headingsTrigger} ${symbolTrigger}bar${symbolTrigger}`,
      false,
    ),
    // Escaped command with preceding unicode characters
    makeInputExpectation(
      `1깍2💩3👨‍👩‍👧‍👦4${escapeCmdCharTrigger}${symbolTrigger}bar`,
      Mode.Standard,
      `1깍2💩3👨‍👩‍👧‍👦4${symbolTrigger}bar`,
      false,
    ),
  ];
}

/**
 * Creates an array of sourced command expectations with command escape characters
 * @returns InputExpectation[]
 */
export function makeEscapedSourcedCommandInputFixture(): InputExpectation[] {
  return [
    // A sourced command is found and prioritized over a prefix command, even with surrounding unicode and escaped commands
    makeInputExpectation(
      `${headingsTrigger}1깍${escapeCmdCharTrigger}${relatedItemsTrigger}💩${symbolTrigger}3👨‍👩‍👧‍👦4`,
      Mode.SymbolList,
      `3👨‍👩‍👧‍👦4`,
      false,
    ),
    // An escaped command is treated as literal text within another command's filterText
    makeInputExpectation(
      `${relatedItemsTrigger}foo ${escapeCmdCharTrigger}${symbolTrigger} bar`,
      Mode.RelatedItemsList,
      `foo ${symbolTrigger} bar`,
      true,
    ),
    // An escaped command is ignored, even if it's the same as a following valid command
    makeInputExpectation(
      `${escapeCmdCharTrigger}${symbolTrigger}${symbolTrigger} bar`,
      Mode.SymbolList,
      ` bar`,
      true,
    ),
    // A double escape is treated as a literal escape character
    makeInputExpectation(
      `${escapeCmdCharTrigger}${symbolTrigger}foo${relatedItemsTrigger} ${escapeCmdCharTrigger}${escapeCmdCharTrigger}bar`,
      Mode.RelatedItemsList,
      ` ${escapeCmdCharTrigger}${escapeCmdCharTrigger}bar`,
      true,
    ),
  ];
}

/**
 * Creates an array of prefix command expectations with command escape characters
 * @returns InputExpectation[]
 */
export function makeEscapedPrefixCommandInputFixture(): InputExpectation[] {
  return [
    makeInputExpectation(
      `${editorTrigger}foo${escapeCmdCharTrigger}${relatedItemsTrigger}`,
      Mode.EditorList,
      `foo${relatedItemsTrigger}`,
      true,
    ),
    makeInputExpectation(
      `${headingsTrigger}깍2💩${escapeCmdCharTrigger}${symbolTrigger}3👨‍👩‍👧‍👦`,
      Mode.HeadingsList,
      `깍2💩${symbolTrigger}3👨‍👩‍👧‍👦`,
      false,
    ),
    makeInputExpectation(
      `${headingsTrigger}${escapeCmdCharTrigger}${relatedItemsTrigger}${escapeCmdCharTrigger}${symbolTrigger}`,
      Mode.HeadingsList,
      `${relatedItemsTrigger}${symbolTrigger}`,
      true,
    ),
  ];
}
