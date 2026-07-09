const test = require('node:test');
const assert = require('node:assert/strict');
const AuthService = require('../../src/main/services/authService');

function createFixture() {
  const users = [];
  let session = null;
  const security = new Map();
  const userRepository = {
    count: () => users.length,
    findByUsername: (username) => users.find((user) => user.username === username),
    findById: (id) => users.find((user) => user.id === id),
    create(input) {
      const user = {
        id: users.length + 1,
        username: input.username,
        password_hash: input.passwordHash,
        name: input.name,
        role: input.role,
        must_change_password: 0,
        active: 1,
        profile_color: input.profileColor,
        avatar_seed: input.avatarSeed,
        avatar_style: input.avatarStyle,
        parental_level: input.parentalLevel
      };
      users.push(user);
      return { lastInsertRowid: user.id };
    },
    list: () => users,
    updatePassword() {},
    update() {},
    countActiveAdminsExcept: () => 1
  };
  const sessionRepository = {
    create(user) {
      session = { user };
    },
    getCurrent: () => session,
    clear() {
      session = null;
    }
  };
  const securityRepository = {
    find: (username) => security.get(username),
    clear: (username) => security.delete(username),
    registerFailure(username, failedAttempts, lockedUntil) {
      security.set(username, { failed_attempts: failedAttempts, locked_until: lockedUntil });
    }
  };
  const settingsRepository = { createDefaultForUser() {} };
  return {
    users,
    security,
    service: new AuthService({
      userRepository,
      sessionRepository,
      securityRepository,
      settingsRepository
    })
  };
}

test('criacao inicial de administrador exige senha forte', async () => {
  const fixture = createFixture();
  assert.equal(fixture.service.setupStatus().needsSetup, true);
  const result = await fixture.service.createInitialAdmin({
    name: 'Raphael',
    username: 'raphael',
    password: 'Senha123!'
  });
  assert.equal(result.user.role, 'ADMIN');
  assert.equal(result.user.avatarStyle, 'thumbs');
  assert.equal(fixture.service.setupStatus().needsSetup, false);
});

test('bloqueio de login e persistido apos cinco falhas', async () => {
  const fixture = createFixture();
  await fixture.service.createInitialAdmin({
    name: 'Raphael',
    username: 'raphael',
    password: 'Senha123!'
  });
  fixture.service.logout();

  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(
      () => fixture.service.login({ username: 'raphael', password: 'Errada999' }),
      /Usuario ou senha invalidos/
    );
  }
  assert.ok(fixture.security.get('raphael').locked_until);
  await assert.rejects(
    () => fixture.service.login({ username: 'raphael', password: 'Senha123!' }),
    /Muitas tentativas invalidas/
  );
});
