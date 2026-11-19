# Project Rules

## Windows 环境下执行命令的注意事项

### safe-rm 注入导致命令失败
Trae IDE 的 safe-rm 保护机制会在命令前注入 bash 风格的环境变量（如 `SAFE_RM_ALLOWED_PATH=xxx SAFE_RM_DENIED_PATH=xxx python server.py`），但 Windows CMD 不支持 `VAR=value command` 语法，会报错 `'SAFE_RM_ALLOWED_PATH' is not recognized as an internal or external command`。

**解决方案：在命令前加 `&` 前缀**

```
& python server.py
```

这样实际执行的命令变成：
```
SAFE_RM_DENIED_PATH=xxx & python server.py
```
CMD 会把 `SAFE_RM_DENIED_PATH=xxx` 当作一条命令执行（失败），然后 `&` 后面的 `python server.py` 正常执行。

### 后台进程的输出获取
- 使用 `blocking: false` 启动的后台进程（如 web server），无法直接通过 `CheckCommandStatus` 获取其 stdout 输出
- **变通方法**：在同一终端执行一条 `blocking: true` 的小命令，之前的后台进程输出会混在一起返回

## 项目说明
- 这是一个纯前端演示项目，不考虑接口的实现
- 数据交互使用模拟数据
- 跨组件的数据交互使用 Vuex 进行状态管理