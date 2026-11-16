(() => {
  document.querySelectorAll('[data-gapnext-file]').forEach(panel => {
    const id = panel.querySelector('[data-file-id]');
    const name = panel.querySelector('[data-file-name]');
    panel.querySelector('[data-choose-file]').addEventListener('click', () => {
      const frame = wp.media({title: 'Choose customer email attachment', button: {text: 'Use this file'}, library: {type: ['application/pdf', 'image/png', 'image/jpeg']}, multiple: false});
      frame.on('select', () => {
        const file = frame.state().get('selection').first().toJSON();
        id.value = String(file.id);
        name.textContent = file.filename || file.title || 'Selected file';
      });
      frame.open();
    });
    panel.querySelector('[data-default-file]').addEventListener('click', event => {
      id.value = '0';
      name.textContent = event.currentTarget.dataset.defaultName;
    });
  });
})();
