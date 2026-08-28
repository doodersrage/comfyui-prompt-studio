/* Subtle polish for Prompt Studio docs */
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.ps-hero');
  if (!hero) {
    return;
  }
  document.body.classList.add('ps-home');
});
