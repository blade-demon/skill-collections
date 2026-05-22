import { ROLE_WORDS, CONTAINER_ROLES, type RoleWord } from '../types.js';

export interface ValidResult {
  valid: true;
}
export interface InvalidResult {
  valid: false;
  error: string;
}
export type ParseResult = ValidResult | InvalidResult;

export class ParseError extends Error {}

class Parser {
  private pos = 0;
  constructor(private readonly input: string) {}

  parse(): void {
    this.seq(false);
    if (this.pos !== this.input.length) {
      throw new ParseError(
        `Unexpected token at position ${this.pos}: "${this.input.slice(this.pos, this.pos + 15)}"`,
      );
    }
  }

  private seq(insideRow: boolean): void {
    this.row();
    while (this.peek(' -> ')) {
      if (insideRow) {
        throw new ParseError(
          `Bare ' -> ' sequence is not allowed on the right side of '+'. Wrap in a container.`,
        );
      }
      this.consume(' -> ');
      this.row();
    }
  }

  private row(): void {
    this.atom(false);
    while (this.peek(' + ')) {
      this.consume(' + ');
      this.atom(true);
    }
  }

  private atom(insideRow: boolean): void {
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
      this.seq(false);
      if (!this.peek(')')) {
        throw new ParseError(`Expected ')' to close '${role}(', at position ${this.pos}`);
      }
      this.consume(')');
      // A container atom is an opaque unit — ' -> ' after it belongs to the enclosing seq,
      // NOT to the current '+' row. No check needed here.
    } else {
      this.tryConsume('?');
      // After a leaf atom on the right side of '+', a bare ' -> ' is forbidden
      if (insideRow && this.peek(' -> ')) {
        throw new ParseError(
          `Bare ' -> ' sequence is not allowed on the right side of '+'. Wrap in a container.`,
        );
      }
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

export function validateSlotExpr(expr: string): ParseResult {
  if (expr === '-') return { valid: true };

  // Quick pre-checks for forbidden patterns
  if (/[|*&~]/.test(expr)) {
    return { valid: false, error: `Forbidden operator in expression: use only -> and +` };
  }
  // Operators without spaces: ->  or  ->x  or  x->
  if (/(?<![- ])->/.test(expr) || /->(?!\s|$)/.test(expr)) {
    return { valid: false, error: `Operator '->' must be surrounded by spaces: use ' -> '` };
  }
  if (/(?<![+ ])\+/.test(expr) || /\+(?!\s|$)/.test(expr)) {
    return { valid: false, error: `Operator '+' must be surrounded by spaces: use ' + '` };
  }

  try {
    new Parser(expr).parse();
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof ParseError ? e.message : String(e) };
  }
}
