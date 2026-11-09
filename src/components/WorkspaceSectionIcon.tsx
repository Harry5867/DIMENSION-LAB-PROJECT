import type { PortalSection } from '../utils/portalNavigation';

/** Small, code-native illustrations share the lab's line weight and palette. */
export function WorkspaceSectionIcon({ section }: { section: PortalSection['id'] }) {
  return <svg className={'workspace-section-icon workspace-section-icon--' + section} viewBox="0 0 96 96"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {section === 'theory' && <>
      <path d="M48 29C38 22 26 21 15 25v45c11-4 23-3 33 4 10-7 22-8 33-4V25c-11-4-23-3-33 4Z" fill="currentColor" fillOpacity=".055" />
      <path d="M48 29v45M15 70v5c11-4 23-3 33 4 10-7 22-8 33-4v-5" opacity=".45" />
      <g className="workspace-icon-book-leaf">
        <path d="m23 38 9-4 8 9-7 10-10-4m9-15 1 19" opacity=".6" />
        <circle cx="23" cy="38" r="2.3" fill="currentColor" /><circle cx="32" cy="34" r="2.3" fill="currentColor" />
        <circle cx="40" cy="43" r="2.3" fill="currentColor" /><circle cx="33" cy="53" r="2.3" fill="currentColor" />
        <path d="M23 61c6-1 11 0 17 3" opacity=".45" />
      </g>
      <g className="workspace-icon-book-right"><path d="M56 37c6-2 11-3 17-2M56 45c6-2 11-3 17-2M56 53c6-2 11-3 17-2M56 61c4-2 7-2 11-2" opacity=".65" /></g>
    </>}
    {section === 'model' && <>
      <path d="M20 74h59M20 74V19m0 55 35-27" opacity=".45" />
      <path d="m75 71 4 3-4 3M17 23l3-4 3 4m28 22 4 2-2 4" opacity=".45" />
      <g className="workspace-icon-model-cluster"><path d="m30 48 8-12 10 8-8 13Z" fill="currentColor" fillOpacity=".08" strokeOpacity=".3" />
        <circle cx="36" cy="44" r="2.2" fill="currentColor" /><circle cx="41" cy="47" r="2.8" fill="currentColor" />
        <circle cx="39" cy="39" r="1.8" fill="currentColor" /><circle cx="33" cy="50" r="1.6" fill="currentColor" /></g>
      <g className="workspace-icon-model-cluster"><path d="m54 28 10-9 13 9-12 12Z" fill="currentColor" fillOpacity=".06" strokeOpacity=".3" />
        <circle cx="62" cy="27" r="2.6" fill="currentColor" /><circle cx="68" cy="30" r="2" fill="currentColor" />
        <circle cx="66" cy="23" r="1.5" fill="currentColor" /><circle cx="61" cy="33" r="1.5" fill="currentColor" /></g>
      <g className="workspace-icon-model-cluster"><path d="m57 58 9-10 13 9-12 12Z" fill="currentColor" fillOpacity=".06" strokeOpacity=".3" />
        <circle cx="65" cy="56" r="2.5" fill="currentColor" /><circle cx="71" cy="59" r="2" fill="currentColor" />
        <circle cx="65" cy="63" r="1.5" fill="currentColor" /></g>
    </>}
    {section === 'about' && <>
      <path className="workspace-icon-team-link" d="m29 41 11-10m16 0 11 10M31 62h34" opacity=".35" />
      <circle cx="48" cy="25" r="8" fill="currentColor" fillOpacity=".06" />
      <path d="M33 57v-8c0-7 7-12 15-12s15 5 15 12v8M40 57V47m16 10V47" />
      <g className="workspace-icon-team-member"><circle cx="22" cy="43" r="6" fill="currentColor" fillOpacity=".06" />
        <path d="M11 76V63c0-6 5-10 11-10 4 0 7 1 10 4M18 76V64m9 12V65" /></g>
      <g className="workspace-icon-team-member"><circle cx="74" cy="43" r="6" fill="currentColor" fillOpacity=".06" />
        <path d="M85 76V63c0-6-5-10-11-10-4 0-7 1-10 4M78 76V64m-9 12V65" /></g>
      <path d="M38 76h20" opacity=".4" />
    </>}
    {section === 'guide' && <>
      <path d="M22 74V55c0-7 6-12 13-12h24c9 0 15-6 15-14V19" strokeDasharray="2 5" opacity=".35" />
      <path className="workspace-icon-guide-trail" d="M22 74V55c0-7 6-12 13-12h24c9 0 15-6 15-14V19" />
      <circle cx="22" cy="74" r="5" fill="currentColor" fillOpacity=".09" />
      <circle cx="48" cy="43" r="5" fill="currentColor" fillOpacity=".09" />
      <path d="m67 26 7-7 7 7M37 73h17M37 80h10M19 24h15m-7-7v14" opacity=".55" />
    </>}
    {section === 'library' && <>
      <g className="workspace-icon-dataset-bottom"><path d="m15 59 33-15 33 15-33 16Z" fill="currentColor" fillOpacity=".04" /></g>
      <g className="workspace-icon-dataset-middle"><path d="m15 45 33-15 33 15-33 16Z" fill="currentColor" fillOpacity=".04" /></g>
      <g className="workspace-icon-dataset-top"><path d="m15 31 33-15 33 15-33 16Z" fill="currentColor" fillOpacity=".07" />
        <path d="m32 23 33 15M22 35l33-15m-17 22 33-15" opacity=".3" />
        <path d="m37 30 6-3 6 3-6 3Z" fill="currentColor" stroke="none" /><circle cx="56" cy="32" r="2" fill="currentColor" stroke="none" /></g>
      <path d="M48 81v3m-14-6v3m28-3v3" opacity=".35" />
    </>}
  </svg>;
}
