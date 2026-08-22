import { ROLE_WORDS, CONTAINER_ROLES, type ContainerRole, type RoleWord } from '../types.js';

export interface ValidResult {
  valid: true;
}
export interface InvalidResult {
  valid: false;
  error: string;
}
export type ParseResult = ValidResult | InvalidResult;

export interface MissingNode {
  kind: 'missing';
}

export interface SequenceNode {
  kind: 'sequence';
  rows: RowNode[];
}

export interface RowNode {
  kind: 'row';
  atoms: AtomNode[];
}

export interface LeafNode {
  kind: 'leaf';
  role: RoleWord;
  uncertain: boolean;
}

export interface ContainerNode {
  kind: 'container';
  role: ContainerRole;
  child: SequenceNode;
}

export type AtomNode = LeafNode | ContainerNode;
export type SlotExprNode = MissingNode | SequenceNode;
export type SlotAstParseResult =
  | { valid: true; ast: SlotExprNode }
  | { valid: false; error: string };

export class ParseError extends Error {}

class Parser {
  private pos = 0;
  constructor(private readonly input: string) {}

  parse(): SequenceNode {
    const ast = this.seq(false);
    if (this.pos !== this.input.length) {
      throw new ParseError(
        `Unexpected token at position ${this.pos}: "${this.input.slice(this.pos, this.pos + 15)}"`,
      );
    }
    return ast;
  }

  private seq(insideRow: boolean): SequenceNode {
    const rows = [this.row()];
    while (this.peek(' -> ')) {
      if (insideRow) {
        throw new ParseError(
          `Bare ' -> ' sequence is not allowed on the right side of '+'. Wrap in a container.`,
        );
      }
      this.consume(' -> ');
      rows.push(this.row());
    }
    return { kind: 'sequence', rows };
  }

  private row(): RowNode {
    const atoms = [this.atom(false)];
    while (this.peek(' + ')) {
      this.consume(' + ');
      atoms.push(this.atom(true));
    }
    return { kind: 'row', atoms };
  }

  private atom(insideRow: boolean): AtomNode {
    const role = this.readRole();
    if (!role) {
      throw new ParseError(
        `Expected role word at position ${this.pos}, got "${this.input.slice(this.pos, this.pos + 10)}"`,
      );
    }

    if (this.peek('(')) {
      if (!(CONTAINER_ROLES as readonly string[]).includes(role)) {
        throw new ParseError(`Role '${role}' is a leaf node and cannot be followed by '('`);
      }
      this.consume('(');
      const child = this.seq(false);
      if (!this.peek(')')) {
        throw new ParseError(`Expected ')' to close '${role}(', at position ${this.pos}`);
      }
      this.consume(')');
      // A container atom is an opaque unit — ' -> ' after it belongs to the enclosing seq,
      // NOT to the current '+' row. No check needed here.
      return {
        kind: 'container',
        role: role as ContainerRole,
        child,
      };
    } else {
      const uncertain = this.tryConsume('?');
      // After a leaf atom on the right side of '+', a bare ' -> ' is forbidden
      if (insideRow && this.peek(' -> ')) {
        throw new ParseError(
          `Bare ' -> ' sequence is not allowed on the right side of '+'. Wrap in a container.`,
        );
      }
      return { kind: 'leaf', role, uncertain };
    }
  }

  private readRole(): RoleWord | null {
    for (const role of ROLE_WORDS) {
      if (this.input.startsWith(role, this.pos)) {
        const afterRole = this.pos + role.length;
        const next = this.input[afterRole];
        if (next === undefined || next === ' ' || next === '?' || next === '(' || next === ')') {
          this.pos = afterRole;
          return role;
        }
      }
    }
    // If we see letters that don't match any role, throw unknown-role error
    const unknownMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(this.input.slice(this.pos));
    if (unknownMatch) {
      throw new ParseError(
        `Unknown role word '${unknownMatch[0]}'. Allowed: ${ROLE_WORDS.join(', ')}`,
      );
    }
    return null;
  }

  private peek(s: string): boolean {
    return this.input.startsWith(s, this.pos);
  }

  private consume(s: string): void {
    if (!this.peek(s)) throw new ParseError(`Expected '${s}' at position ${this.pos}`);
    this.pos += s.length;
  }

  private tryConsume(s: string): boolean {
    if (this.peek(s)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }
}

function precheckSlotExpr(expr: string): string | null {
  // Quick pre-checks for forbidden patterns
  if (/[|*&~]/.test(expr)) {
    return `Forbidden operator in expression: use only -> and +`;
  }
  // Operators without spaces: ->  or  ->x  or  x->
  if (/(?<![- ])->/.test(expr) || /->(?!\s|$)/.test(expr)) {
    return `Operator '->' must be surrounded by spaces: use ' -> '`;
  }
  if (/(?<![+ ])\+/.test(expr) || /\+(?!\s|$)/.test(expr)) {
    return `Operator '+' must be surrounded by spaces: use ' + '`;
  }
  return null;
}

export function parseSlotExpr(expr: string): SlotAstParseResult {
  if (expr === '-') return { valid: true, ast: { kind: 'missing' } };

  const precheck = precheckSlotExpr(expr);
  if (precheck) return { valid: false, error: precheck };

  try {
    return { valid: true, ast: new Parser(expr).parse() };
  } catch (e) {
    return { valid: false, error: e instanceof ParseError ? e.message : String(e) };
  }
}

export function validateSlotExpr(expr: string): ParseResult {
  const result = parseSlotExpr(expr);
  return result.valid ? { valid: true } : result;
}
