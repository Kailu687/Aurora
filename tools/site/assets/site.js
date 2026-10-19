/* Aurora website: small progressive enhancements (reveal on scroll, active nav) */
(function () {
  const els = [].slice.call(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => { entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
})();
