setBackground('#222');

const logo  = createSprite(600, 450, '../demo/koding.png');
logo.setScale(0.5);

const label = createTextBox(600, 120, 'Type below…', 'gold', 32);
const box   = createInputBox(600, 720, 400, 32, 'Say something…');
box.focus();

forever(() => {
  logo.direction += 1;         // spin
  label.setText(box.value);    // live echo
});
