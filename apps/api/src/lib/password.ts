import bcrypt from "bcryptjs";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** bcrypt. Tests pass a low cost to stay fast; production uses 12. */
export function createPasswordHasher(rounds = 12): PasswordHasher {
  return {
    hash: (password) => bcrypt.hash(password, rounds),
    verify: (password, hash) => bcrypt.compare(password, hash),
  };
}
