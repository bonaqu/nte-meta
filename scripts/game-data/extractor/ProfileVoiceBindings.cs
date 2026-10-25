using System.Text.Json;
using System.Text.RegularExpressions;

// Asset filenames may retain retired IDs (1009FileDataTable contains row 1051).
// The row key is the game's explicit character binding, including variant IDs.
internal static class ProfileVoiceBindings
{
 internal sealed record Binding(string OwnerId, string EventName);
 internal static Binding[] Read(string json)
 {
  using var document = JsonDocument.Parse(json);
  var bindings = new HashSet<Binding>();
  foreach (var obj in document.RootElement.EnumerateArray())
  {
   if (!obj.TryGetProperty("Rows", out var rows) || rows.ValueKind != JsonValueKind.Object) continue;
   foreach (var row in rows.EnumerateObject())
   {
    if (!Regex.IsMatch(row.Name, @"^\d{4}$")) continue;
    Walk(row.Value, row.Name);
   }
  }
  return bindings.OrderBy(x => x.OwnerId).ThenBy(x => x.EventName).ToArray();
  void Walk(JsonElement node, string owner)
  {
   if (node.ValueKind == JsonValueKind.Object)
   {
    if (node.TryGetProperty("AssetPathName", out var asset) && asset.ValueKind == JsonValueKind.String &&
        asset.GetString() is string path && path.StartsWith("/Game/WwiseAudio/Events/Voice/"))
     bindings.Add(new(owner, Path.GetFileName(path.Split('.')[0])));
    foreach (var property in node.EnumerateObject()) Walk(property.Value, owner);
   }
   else if (node.ValueKind == JsonValueKind.Array)
    foreach (var child in node.EnumerateArray()) Walk(child, owner);
  }
 }
}
