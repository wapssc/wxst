// Keep keyboard focus inside the active details/source dialog and return it on close.
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modalTitle');
    modal.tabIndex = -1;
    let previousFocus = null;
    let wasOpen = false;
    const observer = new MutationObserver(() => {
        const isOpen = !modal.classList.contains('hidden');
        if (isOpen && !wasOpen) {
            previousFocus = document.activeElement;
            (modal.querySelector('button') || modal).focus();
        } else if (!isOpen && wasOpen && previousFocus?.isConnected) previousFocus.focus();
        wasOpen = isOpen;
    });
    observer.observe(modal, {attributes:true, attributeFilter:['class']});
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); window.closeModal?.(); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
            .filter(element => element.getClientRects().length);
        if (!focusable.length) { event.preventDefault(); modal.focus(); return; }
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
});
