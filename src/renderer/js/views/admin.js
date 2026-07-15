export const features = Object.freeze(['users']);

export function createUsersFeature(context) {
  const {
    $,
    animeDesk,
    escapeHtml,
    getModal,
    setCachedAvatar,
    setVisualAlert,
    showToast,
    state,
    updateUserAvatarPreview
  } = context;

  function bind() {
    $('new-user-button').addEventListener('click', () => openModal());
    $('save-user-button').addEventListener('click', save);
    $('user-avatar-style').addEventListener('change', updateUserAvatarPreview);
    $('user-avatar-seed').addEventListener('input', updateUserAvatarPreview);
    $('user-color').addEventListener('input', updateUserAvatarPreview);
  }

  async function hydrateAvatarStyles() {
    if (!animeDesk.avatars?.styles) return;
    const select = $('user-avatar-style');
    const current = select.value || 'thumbs';
    try {
      const result = await animeDesk.avatars.styles();
      if (!result?.ok || !Array.isArray(result.data) || !result.data.length) return;
      select.replaceChildren();
      for (const style of result.data)
        select.append(new Option(`DiceBear ${style.name}`, style.id));
      select.value = result.data.some((style) => style.id === current) ? current : 'thumbs';
    } catch {
      // A lista estática permanece como fallback offline.
    }
  }

  async function render() {
    const result = await animeDesk.users.list();
    if (!result.ok) return context.notifyResultError(result);
    state.users = result.data;
    const container = $('users-list');
    container.replaceChildren();
    result.data.forEach((user) => {
      const card = document.createElement('article');
      card.className = 'user-card';
      const header = document.createElement('div');
      header.className = 'user-card-header';
      const avatar = document.createElement('img');
      avatar.className = 'profile-avatar';
      avatar.alt = '';
      void setCachedAvatar(avatar, user);
      avatar.style.backgroundColor = user.profileColor;
      const text = document.createElement('div');
      text.innerHTML = `<strong>${escapeHtml(user.name)}</strong><div class="text-secondary">@${escapeHtml(user.username)} · ${user.role}</div>`;
      header.append(avatar, text);
      const status = document.createElement('span');
      status.className = user.active ? 'text-success' : 'text-danger';
      status.textContent = user.active ? 'Ativo' : 'Desativado';
      const actions = document.createElement('div');
      actions.className = 'user-card-actions';
      const edit = document.createElement('button');
      edit.className = 'btn btn-outline-light btn-sm';
      edit.type = 'button';
      edit.innerHTML = '<i class="bi bi-pencil"></i> Editar';
      edit.addEventListener('click', () => openModal(user));
      actions.append(edit);
      card.append(header, status, actions);
      container.append(card);
    });
  }

  function openModal(user = null) {
    $('user-modal-title').textContent = user ? 'Editar usuário' : 'Novo usuário';
    $('user-id').value = user?.id || '';
    $('user-name').value = user?.name || '';
    $('user-username').value = user?.username || '';
    $('user-username').disabled = Boolean(user);
    $('user-password').value = '';
    $('user-password-field').querySelector('label').textContent = user
      ? 'Nova senha (opcional)'
      : 'Senha inicial';
    $('user-role').value = user?.role || 'USER';
    $('user-parental-level').value = user?.parentalLevel || 'ADULT';
    $('user-color').value = user?.profileColor || '#6f5cff';
    $('user-avatar-style').value = user?.avatarStyle || 'thumbs';
    $('user-avatar-seed').value =
      user?.avatarSeed || user?.username || $('user-username').value || '';
    $('user-active').checked = user?.active ?? true;
    updateUserAvatarPreview();
    setVisualAlert($('user-form-alert'), '');
    getModal('user', 'user-modal').show();
  }

  async function save() {
    const id = Number($('user-id').value || 0);
    const payload = {
      id,
      name: $('user-name').value,
      username: $('user-username').value,
      password: $('user-password').value,
      role: $('user-role').value,
      parentalLevel: $('user-parental-level').value,
      profileColor: $('user-color').value,
      avatarSeed: $('user-avatar-seed').value || $('user-username').value,
      avatarStyle: $('user-avatar-style').value,
      active: $('user-active').checked
    };
    let result = id ? await animeDesk.users.update(payload) : await animeDesk.users.create(payload);
    if (id && result.ok && payload.password) {
      result = await animeDesk.users.resetPassword({
        id,
        password: payload.password,
        mustChangePassword: false
      });
    }
    if (!result.ok) {
      setVisualAlert($('user-form-alert'), result.error?.message || 'Não foi possível salvar.');
      return;
    }
    getModal('user', 'user-modal').hide();
    await render();
    showToast({
      title: 'Usuário salvo',
      message: 'As permissões foram atualizadas.',
      variant: 'success'
    });
  }

  return { bind, hydrateAvatarStyles, render };
}
