/* Notifications only: no offline cache or background timer. */
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=event.notification.data?.url;
 if(!target)return;
 event.waitUntil((async()=>{
  const url=new URL(target,self.location.href);
  if(url.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url===url.href);
  if(existing)return existing.focus();
  return self.clients.openWindow(url.href);
 })());
});
