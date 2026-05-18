import fs from 'fs';

const filePath = 'c:\\Users\\aditi\\OneDrive\\Desktop\\company project\\iggymet main\\Frontend\\src\\modules\\DeliveryV2\\pages\\ProfileV2.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// The replacement target
const targetText = `      {/* Basic Compact Header */}
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-50">
        <h1 className="text-base font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="px-4 pt-3 space-y-3">
        
        {/* Simple Profile Identity Card */}
        <div 
          onClick={() => navigate("/food/delivery/profile/details")}
          className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
             <div className="bg-gray-100 w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center">
               {profile?.profileImage?.url ? (
                 <img src={profile.profileImage.url} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <User className="w-6 h-6 text-gray-400" />
               )}
             </div>
             <div>
               <h2 className="text-sm font-bold text-gray-900 leading-tight mb-0.5">{profile?.name || "Delivery Partner"}</h2>
               <p className="text-xs text-gray-500 font-medium">ID: {profile?.deliveryId || "N/A"}</p>
             </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>`;

const newText = `      {/* Enlarge and beautiful Header with Profile Details */}
      <div 
        onClick={() => navigate("/food/delivery/profile/details")}
        className="bg-gradient-to-r from-gray-900 to-gray-800 text-white pt-8 pb-10 px-6 rounded-b-[2rem] shadow-md relative overflow-hidden cursor-pointer active:opacity-95 transition-opacity"
      >
        {/* Decorative backdrop shapes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full -ml-8 -mb-8 blur-xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          {/* Circular Profile Photo on Header */}
          <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-white/20 bg-white/10 flex items-center justify-center shadow-lg">
            {profile?.profileImage?.url ? (
              <img src={profile.profileImage.url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-white/60" />
            )}
          </div>
          
          {/* Name and ID */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white tracking-tight truncate leading-snug">
              {profile?.name || "Delivery Partner"}
            </h1>
            <p className="text-xs text-gray-300 font-medium mt-0.5 flex items-center gap-2">
              <span className="bg-white/10 px-2 py-0.5 rounded-full text-[10px] font-bold text-orange-300 tracking-wider">
                ID: {profile?.deliveryId || "N/A"}
              </span>
              {profile?.status && (
                <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {profile.status}
                </span>
              )}
            </p>
          </div>
          
          <ChevronRight className="w-5 h-5 text-white/60 shrink-0" />
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">`;

// Handle windows CRLF line endings differences
const cleanString = (str) => str.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

const cleanContent = cleanString(content);
const cleanTarget = cleanString(targetText);

if (cleanContent.includes(cleanTarget)) {
  // Let's do a regex or line-based replacement to be robust
  const lines = content.split(/\r?\n/);
  let startIndex = -1;
  let endIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Basic Compact Header')) {
      startIndex = i;
    }
    if (startIndex !== -1 && lines[i].includes('Simple Profile Identity Card')) {
      // Find the closing div of the simple profile card
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes('ChevronRight') && lines[j+1] && lines[j+1].includes('</div>')) {
          endIndex = j + 2; // Include the closing div
          break;
        }
      }
      break;
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    const updatedLines = [
      ...lines.slice(0, startIndex),
      newText,
      ...lines.slice(endIndex)
    ];
    fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8');
    console.log('Successfully updated ProfileV2.jsx!');
  } else {
    console.log('Could not find precise start/end lines');
  }
} else {
  console.log('Target content mismatch');
}
