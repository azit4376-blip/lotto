document.addEventListener('DOMContentLoaded', () => {
    if (window.self !== window.top) document.body.classList.add('is-framed');

    const links = [...document.querySelectorAll('.doc-toc a[href^="#"]')];
    const sections = links
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (!('IntersectionObserver' in window) || !sections.length) return;

    const observer = new IntersectionObserver(entries => {
        const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        links.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`);
        });
    }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.25, 0.6] });

    sections.forEach(section => observer.observe(section));
});
