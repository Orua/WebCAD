// Linux check helper: run the relief quality core (no OCCT) on a worker request; dump target and controls.
// usage: quality_cli request.json outPrefix [target spacingMm]  -> outPrefix.target.f64 (C*R), outPrefix.json (report, dims, deltas)
#include "../relief_design_numeric.hxx"
#include "../relief_quality.hxx"
#include <fstream>
#include <iostream>
using namespace webcad::relief_design;
int main(int c,char** v){std::ifstream f(v[1]);json r=json::parse(f);const json p=quality::withQuality(r.at("params"));
 try{const json& o=p.at("fit");const auto& q=o.at("quality");auto src=quality::sourceOf(q);auto d=quality::domainOf(p.at("domain"));
  const double W=p.at("field").at("widthMm"),H=p.at("field").at("heightMm"),pr=q.at("machiningPrecisionMm");
  if(c>4&&std::string(v[3])=="target"){auto t=quality::buildTarget(src,d,W,H,p.at("baselineMm"),p.at("baselineMm").get<double>()+src.depthMm,pr,atof(v[4]));std::ofstream j(std::string(v[2])+".json");j<<json{{"C",t.C},{"R",t.R},{"h",t.h},{"active",t.active},{"fixed",t.fixed}}.dump();return 0;}
  Fit fit=quality::fitQuality(p.at("field"),p.at("domain"),p.at("baselineMm"),o);
  const double sp=fit.report["quality"]["finestAllowedSpacingMm"];auto t=quality::buildTarget(src,d,W,H,p.at("baselineMm"),p.at("baselineMm").get<double>()+src.depthMm,pr,sp);
  std::ofstream b(std::string(v[2])+".target.f64",std::ios::binary);b.write((const char*)t.h.data(),t.h.size()*8);
  std::ofstream j(std::string(v[2])+".json");j<<json{{"C",t.C},{"R",t.R},{"nx",fit.nx},{"ny",fit.ny},{"deltas",fit.deltas},{"locked",fit.locked},{"deltasF64LE",base64(f64bytes(fit.deltas))},{"sha",sha256Hex(f64bytes(fit.deltas))},{"report",fit.report}}.dump();
 }catch(const Failure& e){std::cerr<<e.code<<" "<<e.what()<<" "<<e.details.dump()<<"\n";return 2;}}
