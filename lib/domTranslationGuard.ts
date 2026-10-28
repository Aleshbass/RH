/**
 * Chrome's Translate (and extensions such as Grammarly) replace the page's text nodes with their
 * own. React later removes or inserts next to a node that is no longer where it left it, throws
 * "Failed to execute 'removeChild' on 'Node'" and the dashboard falls over. This makes those two
 * calls skip a node that has been moved instead of throwing, so translated pages keep working
 * (the workaround from facebook/react#11538). Runs before hydration.
 */
export const domTranslationGuardScript = `(function(){try{if(typeof Node!=='function'||!Node.prototype||Node.prototype.__rhGuard)return;var p=Node.prototype;p.__rhGuard=true;var rc=p.removeChild;p.removeChild=function(c){if(c&&c.parentNode!==this)return c;return rc.apply(this,arguments)};var ib=p.insertBefore;p.insertBefore=function(n,r){if(r&&r.parentNode!==this)return n;return ib.apply(this,arguments)}}catch(e){}})()`
