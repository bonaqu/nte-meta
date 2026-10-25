using System.Collections;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

// The game is only read. All exports go to a separate output directory.
if (args.Length == 2 && args[0] == "--profile-voices") {
 Console.WriteLine(JsonSerializer.Serialize(ProfileVoiceBindings.Read(File.ReadAllText(args[1]))));
 return;
}
if (args.Length < 4) throw new ArgumentException("Usage: extractor <UEExtractor.dll> <archive mount named HT> <usmap> <output> [--probe <path-list>]");
var output = Path.GetFullPath(args[3]);
if (output.Equals(Path.GetFullPath(args[1]),StringComparison.OrdinalIgnoreCase) || output.StartsWith(Path.GetFullPath(args[1]) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Output must be outside the archive mount");
Directory.CreateDirectory(output);
var assembly = Assembly.LoadFrom(Path.GetFullPath(args[0]));
var readerType = assembly.GetType("UnrealArchiveReader", true)!;
readerType.GetField("USMAP_PATH")!.SetValue(null, Path.GetFullPath(args[2]));
using var reader = (IDisposable)Activator.CreateInstance(readerType, [Path.GetFullPath(args[1]), "4_24", ""])!;
var provider = readerType.GetField("_provider", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(reader)!;
var files = Get(provider, "Files")!;
var paths = ((IEnumerable)Get(files, "Keys")!).Cast<string>().Distinct().Order().ToArray();
File.WriteAllLines(Path.Combine(output,"virtual-paths.txt"),paths);
var load = provider.GetType().GetMethod("LoadPackage", [typeof(string)])!;
var jsonType = AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType("Newtonsoft.Json.JsonConvert")).First(t=>t!=null)!;
var serialize = jsonType.GetMethod("SerializeObject",[typeof(object)])!;
if (args.Length == 6 && args[4] == "--probe") {
 File.WriteAllLines(Path.Combine(output,"provider-methods.txt"),provider.GetType().GetMethods().Where(m=>m.Name.Contains("Asset")).Select(m=>m.ToString()!));
 foreach(var path in File.ReadAllLines(args[5]).Where(x=>!string.IsNullOrWhiteSpace(x))) {
  if(!path.EndsWith(".uasset")) { File.WriteAllBytes(Path.Combine(output,Path.GetFileName(path)),(byte[])provider.GetType().GetMethod("SaveAsset",[typeof(string)])!.Invoke(provider,[path])!); continue; }
  try { File.WriteAllText(Path.Combine(output,Hash(path)+".json"),(string)serialize.Invoke(null,[Objects(load.Invoke(provider,[path])!)])!); Console.WriteLine(path+" => "+Hash(path)); }
  catch(Exception ex) {Console.Error.WriteLine(path+": "+ex.GetBaseException().Message);}
 }
 return;
}
var tables = new List<object>(); var images = new List<object>(); var failures = new List<object>();
var referencedImages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
var voiceEvents = new Dictionary<string,HashSet<string>>(StringComparer.OrdinalIgnoreCase);
var voicesOnly = args.Length == 5 && args[4] == "--voices-only";
var fallbackPrefixes = new Dictionary<string,HashSet<string>>(StringComparer.OrdinalIgnoreCase);
var profileOwners = new HashSet<string>();
void AddVoice(string name, string owner) {
 if(!voiceEvents.ContainsKey(name))voiceEvents[name]=new(); voiceEvents[name].Add(owner);
}
void ReadProfile(string json) {
 foreach(var binding in ProfileVoiceBindings.Read(json)) {
  profileOwners.Add(binding.OwnerId); AddVoice(binding.EventName,binding.OwnerId);
 }
}
void ReadVoiceMap(string json) {
 using var document=JsonDocument.Parse(json);
 void Walk(JsonElement node) {
  if(node.ValueKind==JsonValueKind.Object) {
   if(node.TryGetProperty("AllCharacterVoiceInfo",out var entries) && entries.ValueKind==JsonValueKind.Array)
    foreach(var entry in entries.EnumerateArray()) {
     if(!entry.TryGetProperty("Key",out var key) || !entry.TryGetProperty("Value",out var value))continue;
     var owner=key.ToString(); if(!Regex.IsMatch(owner,@"^\d{4}$"))continue;
     foreach(Match match in Regex.Matches(value.GetRawText(),@"Play_Vo_(?:Char|Shouts)_[A-Za-z0-9]+_+[A-Za-z0-9_]+")) {
      var name=match.Value;
      var prefix=Regex.Match(name,@"^Play_Vo_(?:Char|Shouts)_[A-Za-z0-9]+(?:_[FMfm])?_").Value;
      if(prefix.Length>0) { if(!fallbackPrefixes.ContainsKey(prefix))fallbackPrefixes[prefix]=new(); fallbackPrefixes[prefix].Add(owner); }
     }
    }
   foreach(var property in node.EnumerateObject())Walk(property.Value);
  } else if(node.ValueKind==JsonValueKind.Array)foreach(var child in node.EnumerateArray())Walk(child);
 }
 Walk(document.RootElement);
}
if(voicesOnly) {
 using var prior=JsonDocument.Parse(File.ReadAllText(Path.Combine(output,"extraction.json")));
 foreach(var table in prior.RootElement.GetProperty("tables").EnumerateArray()) {
  var path=table.GetProperty("path").GetString()!;
  if(Regex.IsMatch(path,@"/\d{4}FileDataTable\d*\.uasset$")) {
   var json=File.ReadAllText(Path.Combine(output,table.GetProperty("file").GetString()!));
   ReadProfile(json);
  }
  if(path.EndsWith("/DT_CharacterVoice.uasset"))ReadVoiceMap(File.ReadAllText(Path.Combine(output,table.GetProperty("file").GetString()!)));
 }
}
Directory.CreateDirectory(Path.Combine(output,"tables")); Directory.CreateDirectory(Path.Combine(output,"textures"));
foreach (var path in paths.Where(x=>!voicesOnly && x.StartsWith("HT/Content/DataTable/") && x.EndsWith(".uasset") && (IsRelevantTable(x) || x.EndsWith("/DT_CharacterVoice.uasset")))) {
 try {
  var objects=Objects(load.Invoke(provider,[path])!);
  var json=(string)serialize.Invoke(null,[objects])!;
  if(path.EndsWith("/DT_CharacterVoice.uasset"))ReadVoiceMap(json);
  if(Regex.IsMatch(path,@"/\d{4}FileDataTable\d*\.uasset$"))ReadProfile(json);
  var name=Hash(path)+".json";
  File.WriteAllText(Path.Combine(output,"tables",name),json);
  tables.Add(new {path,file="tables/"+name});
  foreach(Match match in Regex.Matches(json,"\"AssetPathName\":\"(/Game/[^\"]+)\"")) {
   var asset=match.Groups[1].Value.Split('.')[0];
   if(asset.StartsWith("/Game/UI/")) referencedImages.Add("HT/Content/"+asset[6..]+".uasset");
  }
 } catch(Exception ex) { failures.Add(new {path,error=ex.GetBaseException().Message}); }
}
foreach(var path in paths.Where(x=>!voicesOnly && x.EndsWith(".uasset") && (referencedImages.Contains(x) || x.StartsWith("HT/Content/UI/UI_Icon/") || x.StartsWith("HT/Content/UI/UI/Appearance/") || x.StartsWith("HT/Content/UI/UI/Awaken/") || x.StartsWith("HT/Content/UI/UI/likeability/") || x.StartsWith("HT/Content/UI/UI/Gacha/") || x.StartsWith("HT/Content/UI/UI/Equip/")))) {
 try {
  var texture=Objects(load.Invoke(provider,[path])!).FirstOrDefault(x=>x?.GetType().Name=="UTexture2D");
  if(texture==null) continue;
  var platform=Get(texture,"PlatformData")!;
  var mip=((IEnumerable)Get(platform,"Mips")!).Cast<object>().FirstOrDefault(m=>Convert.ToInt32(Get(m,"SizeX"))<=8192 && Convert.ToInt32(Get(m,"SizeY"))<=8192);
  if(mip==null) throw new Exception("No bounded image mip");
  var bytes=(byte[]?)Get(Get(mip,"BulkData")!,"Data");
  if(bytes==null || bytes.Length==0) throw new Exception("Missing texture payload");
  var name=Hash(path)+".bin";
  File.WriteAllBytes(Path.Combine(output,"textures",name),bytes);
  images.Add(new {path,file="textures/"+name,width=Convert.ToInt32(Get(mip,"SizeX")),height=Convert.ToInt32(Get(mip,"SizeY")),format=Get(texture,"Format")!.ToString()});
 } catch(Exception ex) { failures.Add(new {path,error=ex.GetBaseException().Message}); }
}
var voices=new List<object>();
// A missing FileDataTable must not hide a new character's installed voice pack.
// Prefix ownership is accepted only when the game's explicit map is unique.
foreach(var path in paths.Where(x=>x.EndsWith(".bnk"))) {
 var name=Path.GetFileNameWithoutExtension(path);
 foreach(var pair in fallbackPrefixes)
  if(pair.Value.Count==1 && !profileOwners.Contains(pair.Value.Single()) && name.StartsWith(pair.Key,StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(name,@"^Play_Vo_Char_.+_\d{3}$"))AddVoice(name,pair.Value.Single());
}
var saveAsset=provider.GetType().GetMethod("SaveAsset",[typeof(string)])!;
var pathSet=paths.ToHashSet(StringComparer.OrdinalIgnoreCase);
foreach(var path in paths.Where(x=>x.EndsWith(".bnk") && voiceEvents.ContainsKey(Path.GetFileNameWithoutExtension(x)))) {
 var locale=Path.GetFileName(Path.GetDirectoryName(path));
 if(!new[]{"English","Japanese","Korean","Chinese"}.Contains(locale))continue;
 try {
  var bank=(byte[])saveAsset.Invoke(provider,[path])!;
  foreach(var mediaId in SoundMediaIds(bank)) {
   var media=$"HT/Content/WwiseAudio/Media/{locale}/{mediaId}.wem";
   if(!pathSet.Contains(media)) { failures.Add(new {path,error="Profile voice media is missing: "+mediaId});continue; }
   var filename=$"audio/{locale}/{mediaId}.wem"; Directory.CreateDirectory(Path.Combine(output,"audio",locale!));
   if(!File.Exists(Path.Combine(output,filename)))File.WriteAllBytes(Path.Combine(output,filename),(byte[])saveAsset.Invoke(provider,[media])!);
   foreach(var owner in voiceEvents[Path.GetFileNameWithoutExtension(path)]) voices.Add(new {ownerId=owner,locale,eventName=Path.GetFileNameWithoutExtension(path),mediaId,file=filename,path=media,binding=profileOwners.Contains(owner)?"profile":"character-voice-map"});
  }
 } catch(Exception ex){failures.Add(new {path,error=ex.GetBaseException().Message});}
}
if(voicesOnly) {
 var manifest=System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(Path.Combine(output,"extraction.json")))!.AsObject();
 manifest["voices"]=System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(voices));
 var retained=manifest["failures"]!.AsArray().Where(x=>!x!["path"]!.GetValue<string>().EndsWith(".bnk")).Select(x=>x!.ToJsonString());
 manifest["failures"]=System.Text.Json.Nodes.JsonNode.Parse("["+string.Join(",",retained.Concat(failures.Select(x=>JsonSerializer.Serialize(x))).Distinct())+"]");
 File.WriteAllText(Path.Combine(output,"extraction.json"),manifest.ToJsonString());
} else File.WriteAllText(Path.Combine(output,"extraction.json"),JsonSerializer.Serialize(new {formatVersion=2,tables,images,voices,failures}));
Console.WriteLine($"Exported {tables.Count} tables, {images.Count} textures; {failures.Count} errors (see extraction.json)");
static object? Get(object obj,string name)=>obj.GetType().GetProperty(name)?.GetValue(obj)??obj.GetType().GetField(name)?.GetValue(obj);
static object?[] Objects(object pkg)=>((IEnumerable)Get(pkg,"ExportsLazy")!).Cast<object>().Select(x=>Get(x,"Value")).ToArray();
static string Hash(string path)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path.ToLowerInvariant()))).ToLowerInvariant()[..20];
static bool IsRelevantTable(string path)=>new[]{"/Character/","/Inventory/","/Equipment/","/Fork/","/LikeabilitySystem/","/PackData/","/Skill/","/Food/","/ItemSource/","/Drop/","/Awards/"}.Any(path.Contains) || path.Contains("DT_CharacterElementTypeData");
// Wwise 2023 sound banks (version 154): Sound has object ID, plugin ID,
// stream type, then source ID. Never infer media from arbitrary integers.
static IEnumerable<uint> SoundMediaIds(byte[] bank) {
 if(bank.Length<12 || Encoding.ASCII.GetString(bank,0,4)!="BKHD" || BitConverter.ToUInt32(bank,8)!=154)throw new InvalidDataException("Unsupported Wwise bank version");
 for(int p=0;p+8<=bank.Length;) {
  int size=checked((int)BitConverter.ToUInt32(bank,p+4)); int start=p+8;
  if(size<0 || start+size>bank.Length)throw new InvalidDataException("Truncated bank chunk");
  if(Encoding.ASCII.GetString(bank,p,4)=="HIRC") {
   int count=checked((int)BitConverter.ToUInt32(bank,start));int q=start+4;
   for(int i=0;i<count;i++) {
    if(q+5>start+size)throw new InvalidDataException("Truncated HIRC object");
    byte type=bank[q];int length=checked((int)BitConverter.ToUInt32(bank,q+1));q+=5;
    if(length<0 || q+length>start+size)throw new InvalidDataException("Invalid HIRC object length");
    if(type==2 && length>=13)yield return BitConverter.ToUInt32(bank,q+9);
    q+=length;
   }
  }
  p=start+size;
 }
}
