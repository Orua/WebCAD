# 材料密度与重量

设置 → 工程 → 材料密度与重量，维护常用金属参考密度（g/cm³）和默认材料。对象属性可单独选择重量材料，与显示颜色、电镀材质独立。配置随工程保存及撤销；浏览器 cookie 记住新工程默认值。修改密度不改变几何。变换、加工后的对象沿来源继承材料；组合材料不同时应分别测量各部件，合并对象仅采用首项来源材料。

`getMaterials()` 返回 `settings` 与 `materials`。使用 `execute({context,idempotencyKey,action:'document.materials',args:{settings}})` 完整更新。settings 含 version:1、defaultMaterial、densities、bodyMaterials；材料编号来自 getMaterials。每种密度必须为大于0且不超过30的有限数字。

`measureMass({context,bodyId,materialId?})` 通过当前内核测量体积，按显式材料、对象材料、工程默认材料优先级返回 materialId/materialName/densityGcm3/volumeMm3/massGrams/estimated/reason/source/context。公式：克 = mm³ × g/cm³ ÷ 1000。没有有效体积返回 null 和 VOLUME_UNAVAILABLE，不用零代替未知值。不计算电镀、损耗或未装入当前对象的配件。

默认值是估算参考，应按实际牌号、供应商和工艺修正，不能作为称重或合金鉴定结果。锌合金采用 Zamak3 的6.6参考，铜8.94参考；其余为常见金属近似。参考来源：[Zamak3制造资料](https://www.newayprecision.com/storage/attachments/2023/12/28/Neway%20Die%20Cast%20Zinc%20Alloy%20Zamak%203%20Die%20Casting.pdf)、[Copper Development Association](https://archive.copper.org/resources/properties/atomic_properties.php)。
