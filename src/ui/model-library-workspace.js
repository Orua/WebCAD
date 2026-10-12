import {modelLibrary} from '../model-library.js';
import {QUICK_MODELS} from '../quick-models.js';
import {quickModelIcon} from '../quick-model-icons.js';

export function mountModelLibrary(root, {element, button, onChoose, getMode, setMode}) {
  let selectedId = null, query = '', library;
  const header = element('header', {class:'library-heading'});
  const title = element('div'); title.append(element('h1', {}, '模型库'), element('p', {}, '选模型，设参数，开始建模。'));
  const controls = element('div', {class:'library-controls'});
  const search = element('input', {type:'search', placeholder:'搜索模型名称、类型或说明', 'aria-label':'搜索模型库'});
  const cards = button('卡片', () => setMode('cards'), 'secondary');
  const list = button('详细列表', () => setMode('list'), 'secondary');
  const manage = button('管理模型库', () => {editor.hidden = !editor.hidden; if (!editor.hidden) loadEditor();}, 'secondary');
  controls.append(search, cards, list, manage); header.append(title, controls);
  const error = element('p', {class:'form-error', role:'alert'});
  const content = element('div', {class:'library-content'}), grid = element('div', {class:'library-grid', 'aria-label':'可用快捷模型'}), detail = element('aside', {class:'library-detail', 'aria-label':'模型详情'});
  const editor = element('section', {class:'library-editor', hidden:true, 'aria-label':'模型库管理'});
  const editorTitle = element('h2', {}, '维护常用模型');
  const source = element('select', {'aria-label':'新模型的几何类型'});
  for (const [kind, model] of Object.entries(QUICK_MODELS)) source.append(element('option', {value:kind}, model.label));
  const draft = element('textarea', {rows:12, spellcheck:false, 'aria-label':'模型定义 JSON'});
  const metadata = element('div', {class:'library-config-fields'}), parameters = element('div', {class:'library-config-fields'});
  const idInput=element('input', {type:'text', maxlength:80, 'aria-label':'模型 ID'}),labelInput=element('input', {type:'text', maxlength:100, 'aria-label':'模型名称'}),descriptionInput=element('input', {type:'text', maxlength:1000, 'aria-label':'模型说明'});
  for(const [label,input]of [['模型 ID',idInput],['名称',labelInput],['说明',descriptionInput],['几何类型',source]]){const wrap=element('label',{class:'library-config-field'});wrap.append(element('span',{},label),input);metadata.append(wrap);}
  let parameterInputs=[];
  const syncDraft=()=>{const defaults={};for(const {field,input}of parameterInputs)defaults[field.key]=field.type==='number'?Number(input.value):field.type==='boolean'?input.checked:field.type==='select'?field.options.find(option=>String(option.value)===input.value)?.value:input.value;draft.value=JSON.stringify({id:idInput.value,kind:source.value,label:labelInput.value,description:descriptionInput.value,defaults},null,2);};
  for(const input of [idInput,labelInput,descriptionInput])input.addEventListener('input',syncDraft);
  source.addEventListener('change',()=>loadEditor({id:idInput.value||'my_'+source.value,kind:source.value,label:labelInput.value||'我的'+QUICK_MODELS[source.value].label,description:descriptionInput.value,defaults:QUICK_MODELS[source.value].defaults}));
  const actions = element('div', {class:'library-editor-actions'});
  const message = element('p', {class:'property-footnote'}, '参数配置可以由脚本生成并导入。删除条目不会删除工程里的模型。');
  function loadEditor(entry = library?.entries.find(item => item.id === selectedId)) {
    const value = entry || {id:'my_' + source.value, kind:source.value, label:'我的' + QUICK_MODELS[source.value].label, description:'', defaults:QUICK_MODELS[source.value].defaults};
    idInput.value=value.id;labelInput.value=value.label;descriptionInput.value=value.description||'';source.value=value.kind;parameters.replaceChildren();parameterInputs=[];
    for(const field of QUICK_MODELS[value.kind].fields){
      const wrap=element('label',{class:'library-config-field'});wrap.append(element('span',{},field.label));let input;
      if(field.type==='select'){input=element('select',{'aria-label':'默认 '+field.label});for(const option of field.options)input.append(element('option',{value:option.value},option.label));input.value=String(value.defaults[field.key]);}
      else if(field.type==='boolean'){input=element('input',{type:'checkbox','aria-label':'默认 '+field.label});input.checked=value.defaults[field.key];}
      else{input=element('input',{type:field.type==='number'?'number':'text','aria-label':'默认 '+field.label});input.value=value.defaults[field.key];for(const key of ['min','max','step'])if(field[key]!==undefined)input.setAttribute(key,field[key]);}
      parameterInputs.push({field,input});input.addEventListener('input',syncDraft);wrap.append(input);parameters.append(wrap);
    }
    draft.value = JSON.stringify(value, null, 2);
  }
  async function mutate(data) {
    try {
      const api = window.webcad.api;
      const result = await api.updateModelLibrary({context:api.createRequestContext(), expectedLibraryRevision:library?.revision ?? -1, ...data});
      if (result.status === 'failed') throw Error(result.error.message);
      if(data.operation==='upsert')selectedId=data.entry.id;
      error.textContent = ''; render();
    } catch (exception) { error.textContent = exception.message; }
  }
  actions.append(button('新建配置', () => {selectedId = null; loadEditor();}, 'secondary'), button('保存配置', () => {
    try { mutate({operation:'upsert', entry:JSON.parse(draft.value)}); } catch { error.textContent = 'JSON 格式错误，请修正后保存。'; }
  }, 'primary'));
  const remove = button('删除条目', () => {
    const entry = library?.entries.find(item => item.id === selectedId); if (!entry) return;
    const confirmation = element('div', {class:'library-confirm', role:'alert'});
    confirmation.append(element('span', {}, '删除「' + entry.label + '」？可通过恢复默认或导入备份恢复。'), button('确认删除', async () => {await mutate({operation:'remove', id:entry.id}); confirmation.remove();}, 'danger'), button('取消', () => confirmation.remove(), 'secondary'));
    editor.append(confirmation);
  }, 'secondary');
  actions.append(remove);
  for (const [label, delta] of [['上移', -1], ['下移', 1]]) actions.append(button(label, () => {
    const index = library.entries.findIndex(item => item.id === selectedId); if (index < 0) return;
    mutate({operation:'move', id:selectedId, index:Math.max(0, Math.min(library.entries.length - 1, index + delta))});
  }, 'secondary'));
  const transfer = element('details', {class:'library-transfer'}); transfer.append(element('summary', {}, '导入 / 导出配置'));
  const json = element('textarea', {rows:7, 'aria-label':'模型库导入导出 JSON', spellcheck:false});
  transfer.append(json, button('导出到文本', () => {json.value = JSON.stringify(modelLibrary.read(), null, 2); json.focus(); json.select();}, 'secondary'), button('导入并替换模型库', () => {
    try { mutate({operation:'import', library:JSON.parse(json.value)}); } catch { error.textContent = '模型库 JSON 无效。'; }
  }, 'secondary'));
  const restore = button('全量恢复默认库', () => {
    const confirmation = element('div', {class:'library-confirm', role:'alert'});
    confirmation.append(element('span', {}, '恢复全部默认条目、参数和顺序，将替换自定义库。请先导出需要保留的配置。'), button('确认恢复默认', async () => {await mutate({operation:'restore'}); confirmation.remove();}, 'primary'), button('取消', () => confirmation.remove(), 'secondary'));
    editor.append(confirmation);
  }, 'secondary');
  const advanced=element('details',{class:'library-transfer'});advanced.append(element('summary',{},'高级 · 脚本生成的模型 JSON'),draft);
  editor.append(editorTitle, message, metadata, element('h3',{},'默认参数'), parameters, advanced, actions, transfer, restore, button('完成管理', () => {editor.hidden = true;}, 'secondary'));
  content.append(grid, detail); root.append(header, error, editor, content);
  search.addEventListener('input', () => {query = search.value.trim().toLowerCase(); render();});
  function renderDetail(entry) {
    detail.replaceChildren(); if (!entry) {detail.append(element('p', {}, '选择一个模型查看参数与说明。')); return;}
    detail.append(quickModelIcon(entry.kind), element('h2', {}, entry.label), element('p', {}, entry.description), element('p', {class:'library-kind'}, '几何类型 · ' + entry.kind));
    const fields = element('dl', {class:'library-defaults'});
    for (const field of QUICK_MODELS[entry.kind].fields) fields.append(element('dt', {}, field.label), element('dd', {}, String(entry.defaults[field.key])));
    detail.append(fields, button('设置参数并创建', () => onChoose(entry), 'primary'), button('编辑库配置', () => {editor.hidden = false; loadEditor(entry);}, 'secondary'));
    const contract = element('details', {class:'library-contract'}); contract.append(element('summary', {}, 'Agent 调用契约'));
    contract.append(element('pre', {}, JSON.stringify({method:'resolveModelLibrary', args:{id:entry.id, expectedLibraryRevision:library.revision, params:{}}}, null, 2)), element('p', {}, '读取 getModelLibrary 获得字段、范围和工具卡；resolveModelLibrary 返回可送入 run/add 的实际参数。'));
    detail.append(contract);
  }
  function render() {
    try { library = modelLibrary.read(); } catch (exception) {library = null; error.textContent = exception.message; grid.replaceChildren(); detail.replaceChildren(); return;}
    const mode = getMode(); cards.setAttribute('aria-pressed', String(mode === 'cards')); list.setAttribute('aria-pressed', String(mode === 'list'));
    root.dataset.libraryMode = mode; grid.replaceChildren();
    const entries = library.entries.filter(entry => !query || `${entry.label} ${entry.kind} ${entry.description} ${QUICK_MODELS[entry.kind].labelEn || ''}`.toLowerCase().includes(query));
    if (!entries.some(entry => entry.id === selectedId)) selectedId = entries[0]?.id ?? null;
    for (const entry of entries) {
      const tile = button('', () => {selectedId = entry.id; render(); if (!editor.hidden) loadEditor(entry);}, 'library-model');
      tile.dataset.libraryId = entry.id; tile.setAttribute('aria-pressed', String(entry.id === selectedId));
      const copy = element('div', {class:'library-model-copy'}); copy.append(element('strong', {}, entry.label), element('span', {}, entry.description || QUICK_MODELS[entry.kind].label));
      const dimensions = QUICK_MODELS[entry.kind].fields.filter(field => field.type === 'number').slice(0, 3).map(field => field.label + ' ' + entry.defaults[field.key]).join(' · ');
      tile.append(quickModelIcon(entry.kind), copy, element('small', {class:'library-model-values'}, dimensions)); grid.append(tile);
    }
    if (!entries.length) grid.append(element('p', {class:'library-empty'}, query ? '没有匹配的模型。请修改搜索词。' : '模型库为空。添加配置或恢复默认库。'));
    renderDetail(entries.find(entry => entry.id === selectedId));
  }
  render(); return {render};
}
