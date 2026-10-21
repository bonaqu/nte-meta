using System.Collections;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// The game is only read. All exports go to a separate output directory.
if (args.Length != 4) throw new ArgumentException("Usage: extractor <UEExtractor.dll> <archive mount named HT> <usmap> <output>");
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
var tables = new List<object>(); var images = new List<object>(); var failures = new List<object>();
Directory.CreateDirectory(Path.Combine(output,"tables")); Directory.CreateDirectory(Path.Combine(output,"textures"));
foreach (var path in paths.Where(x=>x.StartsWith("HT/Content/DataTable/") && x.EndsWith(".uasset") && IsRelevantTable(x))) {
 try {
  var objects=Objects(load.Invoke(provider,[path])!);
  var json=(string)serialize.Invoke(null,[objects])!;
  var name=Hash(path)+".json";
  File.WriteAllText(Path.Combine(output,"tables",name),json);
  tables.Add(new {path,file="tables/"+name});
 } catch(Exception ex) { failures.Add(new {path,error=ex.GetBaseException().Message}); }
}
foreach(var path in paths.Where(x=>x.EndsWith(".uasset") && (x.StartsWith("HT/Content/UI/UI_Icon/") || x.StartsWith("HT/Content/UI/UI/Appearance/") || x.StartsWith("HT/Content/UI/UI/Awaken/") || x.StartsWith("HT/Content/UI/UI/likeability/") || x.StartsWith("HT/Content/UI/UI/Gacha/") || x.StartsWith("HT/Content/UI/UI/Equip/")))) {
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
File.WriteAllText(Path.Combine(output,"extraction.json"),JsonSerializer.Serialize(new {formatVersion=1,tables,images,failures}));
Console.WriteLine($"Exported {tables.Count} tables, {images.Count} textures; {failures.Count} errors (see extraction.json)");
static object? Get(object obj,string name)=>obj.GetType().GetProperty(name)?.GetValue(obj)??obj.GetType().GetField(name)?.GetValue(obj);
static object?[] Objects(object pkg)=>((IEnumerable)Get(pkg,"ExportsLazy")!).Cast<object>().Select(x=>Get(x,"Value")).ToArray();
static string Hash(string path)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path.ToLowerInvariant()))).ToLowerInvariant()[..20];
static bool IsRelevantTable(string path)=>new[]{"/Character/","/Inventory/","/Equipment/","/Fork/","/LikeabilitySystem/","/PackData/","/Skill/","/Food/","/ItemSource/","/Drop/","/Awards/"}.Any(path.Contains) || path.Contains("DT_CharacterElementTypeData");
