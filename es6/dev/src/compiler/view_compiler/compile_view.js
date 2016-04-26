import { isPresent, isBlank } from 'angular2/src/facade/lang';
import { ListWrapper } from 'angular2/src/facade/collection';
import * as o from '../output/output_ast';
import { EventHandlerVars } from './constants';
import { CompileQuery, createQueryList, addQueryToTokenMap } from './compile_query';
import { CompileMethod } from './compile_method';
import { CompilePipe } from './compile_pipe';
import { ViewType } from 'angular2/src/core/linker/view_type';
import { CompileIdentifierMetadata, CompileTokenMap } from '../compile_metadata';
import { getViewFactoryName, getPropertyInView, createPureProxy } from './util';
export class CompileView {
    constructor(component, genConfig, pipeMetas, styles, viewIndex, declarationElement, templateVariableBindings) {
        this.component = component;
        this.genConfig = genConfig;
        this.pipeMetas = pipeMetas;
        this.styles = styles;
        this.viewIndex = viewIndex;
        this.declarationElement = declarationElement;
        this.templateVariableBindings = templateVariableBindings;
        this.nodes = [];
        // root nodes or AppElements for ViewContainers
        this.rootNodesOrAppElements = [];
        this.bindings = [];
        this.classStatements = [];
        this.eventHandlerMethods = [];
        this.fields = [];
        this.getters = [];
        this.disposables = [];
        this.subscriptions = [];
        this.purePipes = new Map();
        this.pipes = [];
        this.variables = new Map();
        this.literalArrayCount = 0;
        this.literalMapCount = 0;
        this.pipeCount = 0;
        this.createMethod = new CompileMethod(this);
        this.injectorGetMethod = new CompileMethod(this);
        this.updateContentQueriesMethod = new CompileMethod(this);
        this.dirtyParentQueriesMethod = new CompileMethod(this);
        this.updateViewQueriesMethod = new CompileMethod(this);
        this.detectChangesInInputsMethod = new CompileMethod(this);
        this.detectChangesRenderPropertiesMethod = new CompileMethod(this);
        this.afterContentLifecycleCallbacksMethod = new CompileMethod(this);
        this.afterViewLifecycleCallbacksMethod = new CompileMethod(this);
        this.destroyMethod = new CompileMethod(this);
        this.viewType = getViewType(component, viewIndex);
        this.className = `_View_${component.type.name}${viewIndex}`;
        this.classType = o.importType(new CompileIdentifierMetadata({ name: this.className }));
        this.viewFactory = o.variable(getViewFactoryName(component, viewIndex));
        if (this.viewType === ViewType.COMPONENT || this.viewType === ViewType.HOST) {
            this.componentView = this;
        }
        else {
            this.componentView = this.declarationElement.view.componentView;
        }
        var viewQueries = new CompileTokenMap();
        if (this.viewType === ViewType.COMPONENT) {
            var directiveInstance = o.THIS_EXPR.prop('context');
            ListWrapper.forEachWithIndex(this.component.viewQueries, (queryMeta, queryIndex) => {
                var propName = `_viewQuery_${queryMeta.selectors[0].name}_${queryIndex}`;
                var queryList = createQueryList(queryMeta, directiveInstance, propName, this);
                var query = new CompileQuery(queryMeta, queryList, directiveInstance, this);
                addQueryToTokenMap(viewQueries, query);
            });
            var constructorViewQueryCount = 0;
            this.component.type.diDeps.forEach((dep) => {
                if (isPresent(dep.viewQuery)) {
                    var queryList = o.THIS_EXPR.prop('declarationAppElement')
                        .prop('componentConstructorViewQueries')
                        .key(o.literal(constructorViewQueryCount++));
                    var query = new CompileQuery(dep.viewQuery, queryList, null, this);
                    addQueryToTokenMap(viewQueries, query);
                }
            });
        }
        this.viewQueries = viewQueries;
        templateVariableBindings.forEach((entry) => {
            this.variables.set(entry[1], o.THIS_EXPR.prop('locals').key(o.literal(entry[0])));
        });
        if (!this.declarationElement.isNull()) {
            this.declarationElement.setEmbeddedView(this);
        }
    }
    callPipe(name, input, args) {
        var compView = this.componentView;
        var pipe = compView.purePipes.get(name);
        if (isBlank(pipe)) {
            pipe = new CompilePipe(compView, name);
            if (pipe.pure) {
                compView.purePipes.set(name, pipe);
            }
            compView.pipes.push(pipe);
        }
        return pipe.call(this, [input].concat(args));
    }
    getVariable(name) {
        if (name == EventHandlerVars.event.name) {
            return EventHandlerVars.event;
        }
        var currView = this;
        var result = currView.variables.get(name);
        while (isBlank(result) && isPresent(currView.declarationElement.view)) {
            currView = currView.declarationElement.view;
            result = currView.variables.get(name);
        }
        if (isPresent(result)) {
            return getPropertyInView(result, this, currView);
        }
        else {
            return null;
        }
    }
    createLiteralArray(values) {
        var proxyExpr = o.THIS_EXPR.prop(`_arr_${this.literalArrayCount++}`);
        var proxyParams = [];
        var proxyReturnEntries = [];
        for (var i = 0; i < values.length; i++) {
            var paramName = `p${i}`;
            proxyParams.push(new o.FnParam(paramName));
            proxyReturnEntries.push(o.variable(paramName));
        }
        createPureProxy(o.fn(proxyParams, [new o.ReturnStatement(o.literalArr(proxyReturnEntries))]), values.length, proxyExpr, this);
        return proxyExpr.callFn(values);
    }
    createLiteralMap(entries) {
        var proxyExpr = o.THIS_EXPR.prop(`_map_${this.literalMapCount++}`);
        var proxyParams = [];
        var proxyReturnEntries = [];
        var values = [];
        for (var i = 0; i < entries.length; i++) {
            var paramName = `p${i}`;
            proxyParams.push(new o.FnParam(paramName));
            proxyReturnEntries.push([entries[i][0], o.variable(paramName)]);
            values.push(entries[i][1]);
        }
        createPureProxy(o.fn(proxyParams, [new o.ReturnStatement(o.literalMap(proxyReturnEntries))]), entries.length, proxyExpr, this);
        return proxyExpr.callFn(values);
    }
    afterNodes() {
        this.pipes.forEach((pipe) => pipe.create());
        this.viewQueries.values().forEach((queries) => queries.forEach((query) => query.afterChildren(this.updateViewQueriesMethod)));
    }
}
function getViewType(component, embeddedTemplateIndex) {
    if (embeddedTemplateIndex > 0) {
        return ViewType.EMBEDDED;
    }
    else if (component.type.isHost) {
        return ViewType.HOST;
    }
    else {
        return ViewType.COMPONENT;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsZV92aWV3LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGlmZmluZ19wbHVnaW5fd3JhcHBlci1vdXRwdXRfcGF0aC1ZZXhIQmpMbC50bXAvYW5ndWxhcjIvc3JjL2NvbXBpbGVyL3ZpZXdfY29tcGlsZXIvY29tcGlsZV92aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJPQUFPLEVBQUMsU0FBUyxFQUFFLE9BQU8sRUFBQyxNQUFNLDBCQUEwQjtPQUNwRCxFQUFDLFdBQVcsRUFBK0IsTUFBTSxnQ0FBZ0M7T0FFakYsS0FBSyxDQUFDLE1BQU0sc0JBQXNCO09BQ2xDLEVBQUMsZ0JBQWdCLEVBQUMsTUFBTSxhQUFhO09BQ3JDLEVBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxrQkFBa0IsRUFBQyxNQUFNLGlCQUFpQjtPQUcxRSxFQUFDLGFBQWEsRUFBQyxNQUFNLGtCQUFrQjtPQUN2QyxFQUFDLFdBQVcsRUFBQyxNQUFNLGdCQUFnQjtPQUNuQyxFQUFDLFFBQVEsRUFBQyxNQUFNLG9DQUFvQztPQUNwRCxFQUdMLHlCQUF5QixFQUN6QixlQUFlLEVBQ2hCLE1BQU0scUJBQXFCO09BQ3JCLEVBQ0wsa0JBQWtCLEVBR2xCLGlCQUFpQixFQUNqQixlQUFlLEVBQ2hCLE1BQU0sUUFBUTtBQUlmO0lBd0NFLFlBQW1CLFNBQW1DLEVBQVMsU0FBeUIsRUFDckUsU0FBZ0MsRUFBUyxNQUFvQixFQUM3RCxTQUFpQixFQUFTLGtCQUFrQyxFQUM1RCx3QkFBb0M7UUFIcEMsY0FBUyxHQUFULFNBQVMsQ0FBMEI7UUFBUyxjQUFTLEdBQVQsU0FBUyxDQUFnQjtRQUNyRSxjQUFTLEdBQVQsU0FBUyxDQUF1QjtRQUFTLFdBQU0sR0FBTixNQUFNLENBQWM7UUFDN0QsY0FBUyxHQUFULFNBQVMsQ0FBUTtRQUFTLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBZ0I7UUFDNUQsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUFZO1FBdkNoRCxVQUFLLEdBQWtCLEVBQUUsQ0FB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UUFDakMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFDdkIsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ04sTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7SUFDNUIsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge2lzUHJlc2VudCwgaXNCbGFua30gZnJvbSAnYW5ndWxhcjIvc3JjL2ZhY2FkZS9sYW5nJztcbmltcG9ydCB7TGlzdFdyYXBwZXIsIFN0cmluZ01hcFdyYXBwZXIsIE1hcFdyYXBwZXJ9IGZyb20gJ2FuZ3VsYXIyL3NyYy9mYWNhZGUvY29sbGVjdGlvbic7XG5cbmltcG9ydCAqIGFzIG8gZnJvbSAnLi4vb3V0cHV0L291dHB1dF9hc3QnO1xuaW1wb3J0IHtFdmVudEhhbmRsZXJWYXJzfSBmcm9tICcuL2NvbnN0YW50cyc7XG5pbXBvcnQge0NvbXBpbGVRdWVyeSwgY3JlYXRlUXVlcnlMaXN0LCBhZGRRdWVyeVRvVG9rZW5NYXB9IGZyb20gJy4vY29tcGlsZV9xdWVyeSc7XG5pbXBvcnQge05hbWVSZXNvbHZlcn0gZnJvbSAnLi9leHByZXNzaW9uX2NvbnZlcnRlcic7XG5pbXBvcnQge0NvbXBpbGVFbGVtZW50LCBDb21waWxlTm9kZX0gZnJvbSAnLi9jb21waWxlX2VsZW1lbnQnO1xuaW1wb3J0IHtDb21waWxlTWV0aG9kfSBmcm9tICcuL2NvbXBpbGVfbWV0aG9kJztcbmltcG9ydCB7Q29tcGlsZVBpcGV9IGZyb20gJy4vY29tcGlsZV9waXBlJztcbmltcG9ydCB7Vmlld1R5cGV9IGZyb20gJ2FuZ3VsYXIyL3NyYy9jb3JlL2xpbmtlci92aWV3X3R5cGUnO1xuaW1wb3J0IHtcbiAgQ29tcGlsZURpcmVjdGl2ZU1ldGFkYXRhLFxuICBDb21waWxlUGlwZU1ldGFkYXRhLFxuICBDb21waWxlSWRlbnRpZmllck1ldGFkYXRhLFxuICBDb21waWxlVG9rZW5NYXBcbn0gZnJvbSAnLi4vY29tcGlsZV9tZXRhZGF0YSc7XG5pbXBvcnQge1xuICBnZXRWaWV3RmFjdG9yeU5hbWUsXG4gIGluamVjdEZyb21WaWV3UGFyZW50SW5qZWN0b3IsXG4gIGNyZWF0ZURpVG9rZW5FeHByZXNzaW9uLFxuICBnZXRQcm9wZXJ0eUluVmlldyxcbiAgY3JlYXRlUHVyZVByb3h5XG59IGZyb20gJy4vdXRpbCc7XG5pbXBvcnQge0NvbXBpbGVyQ29uZmlnfSBmcm9tICcuLi9jb25maWcnO1xuaW1wb3J0IHtDb21waWxlQmluZGluZ30gZnJvbSAnLi9jb21waWxlX2JpbmRpbmcnO1xuXG5leHBvcnQgY2xhc3MgQ29tcGlsZVZpZXcgaW1wbGVtZW50cyBOYW1lUmVzb2x2ZXIge1xuICBwdWJsaWMgdmlld1R5cGU6IFZpZXdUeXBlO1xuICBwdWJsaWMgdmlld1F1ZXJpZXM6IENvbXBpbGVUb2tlbk1hcDxDb21waWxlUXVlcnlbXT47XG5cbiAgcHVibGljIG5vZGVzOiBDb21waWxlTm9kZVtdID0gW107XG4gIC8vIHJvb3Qgbm9kZXMgb3IgQXBwRWxlbWVudHMgZm9yIFZpZXdDb250YWluZXJzXG4gIHB1YmxpYyByb290Tm9kZXNPckFwcEVsZW1lbnRzOiBvLkV4cHJlc3Npb25bXSA9IFtdO1xuXG4gIHB1YmxpYyBiaW5kaW5nczogQ29tcGlsZUJpbmRpbmdbXSA9IFtdO1xuXG4gIHB1YmxpYyBjbGFzc1N0YXRlbWVudHM6IG8uU3RhdGVtZW50W10gPSBbXTtcbiAgcHVibGljIGNyZWF0ZU1ldGhvZDogQ29tcGlsZU1ldGhvZDtcbiAgcHVibGljIGluamVjdG9yR2V0TWV0aG9kOiBDb21waWxlTWV0aG9kO1xuICBwdWJsaWMgdXBkYXRlQ29udGVudFF1ZXJpZXNNZXRob2Q6IENvbXBpbGVNZXRob2Q7XG4gIHB1YmxpYyBkaXJ0eVBhcmVudFF1ZXJpZXNNZXRob2Q6IENvbXBpbGVNZXRob2Q7XG4gIHB1YmxpYyB1cGRhdGVWaWV3UXVlcmllc01ldGhvZDogQ29tcGlsZU1ldGhvZDtcbiAgcHVibGljIGRldGVjdENoYW5nZXNJbklucHV0c01ldGhvZDogQ29tcGlsZU1ldGhvZDtcbiAgcHVibGljIGRldGVjdENoYW5nZXNSZW5kZXJQcm9wZXJ0aWVzTWV0aG9kOiBDb21waWxlTWV0aG9kO1xuICBwdWJsaWMgYWZ0ZXJDb250ZW50TGlmZWN5Y2xlQ2FsbGJhY2tzTWV0aG9kOiBDb21waWxlTWV0aG9kO1xuICBwdWJsaWMgYWZ0ZXJWaWV3TGlmZWN5Y2xlQ2FsbGJhY2tzTWV0aG9kOiBDb21waWxlTWV0aG9kO1xuICBwdWJsaWMgZGVzdHJveU1ldGhvZDogQ29tcGlsZU1ldGhvZDtcbiAgcHVibGljIGV2ZW50SGFuZGxlck1ldGhvZHM6IG8uQ2xhc3NNZXRob2RbXSA9IFtdO1xuXG4gIHB1YmxpYyBmaWVsZHM6IG8uQ2xhc3NGaWVsZFtdID0gW107XG4gIHB1YmxpYyBnZXR0ZXJzOiBvLkNsYXNzR2V0dGVyW10gPSBbXTtcbiAgcHVibGljIGRpc3Bvc2FibGVzOiBvLkV4cHJlc3Npb25bXSA9IFtdO1xuICBwdWJsaWMgc3Vic2NyaXB0aW9uczogby5FeHByZXNzaW9uW10gPSBbXTtcblxuICBwdWJsaWMgY29tcG9uZW50VmlldzogQ29tcGlsZVZpZXc7XG4gIHB1YmxpYyBwdXJlUGlwZXMgPSBuZXcgTWFwPHN0cmluZywgQ29tcGlsZVBpcGU+KCk7XG4gIHB1YmxpYyBwaXBlczogQ29tcGlsZVBpcGVbXSA9IFtdO1xuICBwdWJsaWMgdmFyaWFibGVzID0gbmV3IE1hcDxzdHJpbmcsIG8uRXhwcmVzc2lvbj4oKTtcbiAgcHVibGljIGNsYXNzTmFtZTogc3RyaW5nO1xuICBwdWJsaWMgY2xhc3NUeXBlOiBvLlR5cGU7XG4gIHB1YmxpYyB2aWV3RmFjdG9yeTogby5SZWFkVmFyRXhwcjtcblxuICBwdWJsaWMgbGl0ZXJhbEFycmF5Q291bnQgPSAwO1xuICBwdWJsaWMgbGl0ZXJhbE1hcENvdW50ID0gMDtcbiAgcHVibGljIHBpcGVDb3VudCA9IDA7XG5cbiAgY29uc3RydWN0b3IocHVibGljIGNvbXBvbmVudDogQ29tcGlsZURpcmVjdGl2ZU1ldGFkYXRhLCBwdWJsaWMgZ2VuQ29uZmlnOiBDb21waWxlckNvbmZpZyxcbiAgICAgICAgICAgICAgcHVibGljIHBpcGVNZXRhczogQ29tcGlsZVBpcGVNZXRhZGF0YVtdLCBwdWJsaWMgc3R5bGVzOiBvLkV4cHJlc3Npb24sXG4gICAgICAgICAgICAgIHB1YmxpYyB2aWV3SW5kZXg6IG51bWJlciwgcHVibGljIGRlY2xhcmF0aW9uRWxlbWVudDogQ29tcGlsZUVsZW1lbnQsXG4gICAgICAgICAgICAgIHB1YmxpYyB0ZW1wbGF0ZVZhcmlhYmxlQmluZGluZ3M6IHN0cmluZ1tdW10pIHtcbiAgICB0aGlzLmNyZWF0ZU1ldGhvZCA9IG5ldyBDb21waWxlTWV0aG9kKHRoaXMpO1xuICAgIHRoaXMuaW5qZWN0b3JHZXRNZXRob2QgPSBuZXcgQ29tcGlsZU1ldGhvZCh0aGlzKTtcbiAgICB0aGlzLnVwZGF0ZUNvbnRlbnRRdWVyaWVzTWV0aG9kID0gbmV3IENvbXBpbGVNZXRob2QodGhpcyk7XG4gICAgdGhpcy5kaXJ0eVBhcmVudFF1ZXJpZXNNZXRob2QgPSBuZXcgQ29tcGlsZU1ldGhvZCh0aGlzKTtcbiAgICB0aGlzLnVwZGF0ZVZpZXdRdWVyaWVzTWV0aG9kID0gbmV3IENvbXBpbGVNZXRob2QodGhpcyk7XG4gICAgdGhpcy5kZXRlY3RDaGFuZ2VzSW5JbnB1dHNNZXRob2QgPSBuZXcgQ29tcGlsZU1ldGhvZCh0aGlzKTtcbiAgICB0aGlzLmRldGVjdENoYW5nZXNSZW5kZXJQcm9wZXJ0aWVzTWV0aG9kID0gbmV3IENvbXBpbGVNZXRob2QodGhpcyk7XG5cbiAgICB0aGlzLmFmdGVyQ29udGVudExpZmVjeWNsZUNhbGxiYWNrc01ldGhvZCA9IG5ldyBDb21waWxlTWV0aG9kKHRoaXMpO1xuICAgIHRoaXMuYWZ0ZXJWaWV3TGlmZWN5Y2xlQ2FsbGJhY2tzTWV0aG9kID0gbmV3IENvbXBpbGVNZXRob2QodGhpcyk7XG4gICAgdGhpcy5kZXN0cm95TWV0aG9kID0gbmV3IENvbXBpbGVNZXRob2QodGhpcyk7XG5cbiAgICB0aGlzLnZpZXdUeXBlID0gZ2V0Vmlld1R5cGUoY29tcG9uZW50LCB2aWV3SW5kZXgpO1xuICAgIHRoaXMuY2xhc3NOYW1lID0gYF9WaWV3XyR7Y29tcG9uZW50LnR5cGUubmFtZX0ke3ZpZXdJbmRleH1gO1xuICAgIHRoaXMuY2xhc3NUeXBlID0gby5pbXBvcnRUeXBlKG5ldyBDb21waWxlSWRlbnRpZmllck1ldGFkYXRhKHtuYW1lOiB0aGlzLmNsYXNzTmFtZX0pKTtcbiAgICB0aGlzLnZpZXdGYWN0b3J5ID0gby52YXJpYWJsZShnZXRWaWV3RmFjdG9yeU5hbWUoY29tcG9uZW50LCB2aWV3SW5kZXgpKTtcbiAgICBpZiAodGhpcy52aWV3VHlwZSA9PT0gVmlld1R5cGUuQ09NUE9ORU5UIHx8IHRoaXMudmlld1R5cGUgPT09IFZpZXdUeXBlLkhPU1QpIHtcbiAgICAgIHRoaXMuY29tcG9uZW50VmlldyA9IHRoaXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY29tcG9uZW50VmlldyA9IHRoaXMuZGVjbGFyYXRpb25FbGVtZW50LnZpZXcuY29tcG9uZW50VmlldztcbiAgICB9XG4gICAgdmFyIHZpZXdRdWVyaWVzID0gbmV3IENvbXBpbGVUb2tlbk1hcDxDb21waWxlUXVlcnlbXT4oKTtcbiAgICBpZiAodGhpcy52aWV3VHlwZSA9PT0gVmlld1R5cGUuQ09NUE9ORU5UKSB7XG4gICAgICB2YXIgZGlyZWN0aXZlSW5zdGFuY2UgPSBvLlRISVNfRVhQUi5wcm9wKCdjb250ZXh0Jyk7XG4gICAgICBMaXN0V3JhcHBlci5mb3JFYWNoV2l0aEluZGV4KHRoaXMuY29tcG9uZW50LnZpZXdRdWVyaWVzLCAocXVlcnlNZXRhLCBxdWVyeUluZGV4KSA9PiB7XG4gICAgICAgIHZhciBwcm9wTmFtZSA9IGBfdmlld1F1ZXJ5XyR7cXVlcnlNZXRhLnNlbGVjdG9yc1swXS5uYW1lfV8ke3F1ZXJ5SW5kZXh9YDtcbiAgICAgICAgdmFyIHF1ZXJ5TGlzdCA9IGNyZWF0ZVF1ZXJ5TGlzdChxdWVyeU1ldGEsIGRpcmVjdGl2ZUluc3RhbmNlLCBwcm9wTmFtZSwgdGhpcyk7XG4gICAgICAgIHZhciBxdWVyeSA9IG5ldyBDb21waWxlUXVlcnkocXVlcnlNZXRhLCBxdWVyeUxpc3QsIGRpcmVjdGl2ZUluc3RhbmNlLCB0aGlzKTtcbiAgICAgICAgYWRkUXVlcnlUb1Rva2VuTWFwKHZpZXdRdWVyaWVzLCBxdWVyeSk7XG4gICAgICB9KTtcbiAgICAgIHZhciBjb25zdHJ1Y3RvclZpZXdRdWVyeUNvdW50ID0gMDtcbiAgICAgIHRoaXMuY29tcG9uZW50LnR5cGUuZGlEZXBzLmZvckVhY2goKGRlcCkgPT4ge1xuICAgICAgICBpZiAoaXNQcmVzZW50KGRlcC52aWV3UXVlcnkpKSB7XG4gICAgICAgICAgdmFyIHF1ZXJ5TGlzdCA9IG8uVEhJU19FWFBSLnByb3AoJ2RlY2xhcmF0aW9uQXBwRWxlbWVudCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnY29tcG9uZW50Q29uc3RydWN0b3JWaWV3UXVlcmllcycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAua2V5KG8ubGl0ZXJhbChjb25zdHJ1Y3RvclZpZXdRdWVyeUNvdW50KyspKTtcbiAgICAgICAgICB2YXIgcXVlcnkgPSBuZXcgQ29tcGlsZVF1ZXJ5KGRlcC52aWV3UXVlcnksIHF1ZXJ5TGlzdCwgbnVsbCwgdGhpcyk7XG4gICAgICAgICAgYWRkUXVlcnlUb1Rva2VuTWFwKHZpZXdRdWVyaWVzLCBxdWVyeSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICB0aGlzLnZpZXdRdWVyaWVzID0gdmlld1F1ZXJpZXM7XG4gICAgdGVtcGxhdGVWYXJpYWJsZUJpbmRpbmdzLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICB0aGlzLnZhcmlhYmxlcy5zZXQoZW50cnlbMV0sIG8uVEhJU19FWFBSLnByb3AoJ2xvY2FscycpLmtleShvLmxpdGVyYWwoZW50cnlbMF0pKSk7XG4gICAgfSk7XG5cbiAgICBpZiAoIXRoaXMuZGVjbGFyYXRpb25FbGVtZW50LmlzTnVsbCgpKSB7XG4gICAgICB0aGlzLmRlY2xhcmF0aW9uRWxlbWVudC5zZXRFbWJlZGRlZFZpZXcodGhpcyk7XG4gICAgfVxuICB9XG5cbiAgY2FsbFBpcGUobmFtZTogc3RyaW5nLCBpbnB1dDogby5FeHByZXNzaW9uLCBhcmdzOiBvLkV4cHJlc3Npb25bXSk6IG8uRXhwcmVzc2lvbiB7XG4gICAgdmFyIGNvbXBWaWV3ID0gdGhpcy5jb21wb25lbnRWaWV3O1xuICAgIHZhciBwaXBlID0gY29tcFZpZXcucHVyZVBpcGVzLmdldChuYW1lKTtcbiAgICBpZiAoaXNCbGFuayhwaXBlKSkge1xuICAgICAgcGlwZSA9IG5ldyBDb21waWxlUGlwZShjb21wVmlldywgbmFtZSk7XG4gICAgICBpZiAocGlwZS5wdXJlKSB7XG4gICAgICAgIGNvbXBWaWV3LnB1cmVQaXBlcy5zZXQobmFtZSwgcGlwZSk7XG4gICAgICB9XG4gICAgICBjb21wVmlldy5waXBlcy5wdXNoKHBpcGUpO1xuICAgIH1cbiAgICByZXR1cm4gcGlwZS5jYWxsKHRoaXMsIFtpbnB1dF0uY29uY2F0KGFyZ3MpKTtcbiAgfVxuXG4gIGdldFZhcmlhYmxlKG5hbWU6IHN0cmluZyk6IG8uRXhwcmVzc2lvbiB7XG4gICAgaWYgKG5hbWUgPT0gRXZlbnRIYW5kbGVyVmFycy5ldmVudC5uYW1lKSB7XG4gICAgICByZXR1cm4gRXZlbnRIYW5kbGVyVmFycy5ldmVudDtcbiAgICB9XG4gICAgdmFyIGN1cnJWaWV3OiBDb21waWxlVmlldyA9IHRoaXM7XG4gICAgdmFyIHJlc3VsdCA9IGN1cnJWaWV3LnZhcmlhYmxlcy5nZXQobmFtZSk7XG4gICAgd2hpbGUgKGlzQmxhbmsocmVzdWx0KSAmJiBpc1ByZXNlbnQoY3VyclZpZXcuZGVjbGFyYXRpb25FbGVtZW50LnZpZXcpKSB7XG4gICAgICBjdXJyVmlldyA9IGN1cnJWaWV3LmRlY2xhcmF0aW9uRWxlbWVudC52aWV3O1xuICAgICAgcmVzdWx0ID0gY3VyclZpZXcudmFyaWFibGVzLmdldChuYW1lKTtcbiAgICB9XG4gICAgaWYgKGlzUHJlc2VudChyZXN1bHQpKSB7XG4gICAgICByZXR1cm4gZ2V0UHJvcGVydHlJblZpZXcocmVzdWx0LCB0aGlzLCBjdXJyVmlldyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGNyZWF0ZUxpdGVyYWxBcnJheSh2YWx1ZXM6IG8uRXhwcmVzc2lvbltdKTogby5FeHByZXNzaW9uIHtcbiAgICB2YXIgcHJveHlFeHByID0gby5USElTX0VYUFIucHJvcChgX2Fycl8ke3RoaXMubGl0ZXJhbEFycmF5Q291bnQrK31gKTtcbiAgICB2YXIgcHJveHlQYXJhbXM6IG8uRm5QYXJhbVtdID0gW107XG4gICAgdmFyIHByb3h5UmV0dXJuRW50cmllczogby5FeHByZXNzaW9uW10gPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHBhcmFtTmFtZSA9IGBwJHtpfWA7XG4gICAgICBwcm94eVBhcmFtcy5wdXNoKG5ldyBvLkZuUGFyYW0ocGFyYW1OYW1lKSk7XG4gICAgICBwcm94eVJldHVybkVudHJpZXMucHVzaChvLnZhcmlhYmxlKHBhcmFtTmFtZSkpO1xuICAgIH1cbiAgICBjcmVhdGVQdXJlUHJveHkoby5mbihwcm94eVBhcmFtcywgW25ldyBvLlJldHVyblN0YXRlbWVudChvLmxpdGVyYWxBcnIocHJveHlSZXR1cm5FbnRyaWVzKSldKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzLmxlbmd0aCwgcHJveHlFeHByLCB0aGlzKTtcbiAgICByZXR1cm4gcHJveHlFeHByLmNhbGxGbih2YWx1ZXMpO1xuICB9XG5cbiAgY3JlYXRlTGl0ZXJhbE1hcChlbnRyaWVzOiBBcnJheTxBcnJheTxzdHJpbmcgfCBvLkV4cHJlc3Npb24+Pik6IG8uRXhwcmVzc2lvbiB7XG4gICAgdmFyIHByb3h5RXhwciA9IG8uVEhJU19FWFBSLnByb3AoYF9tYXBfJHt0aGlzLmxpdGVyYWxNYXBDb3VudCsrfWApO1xuICAgIHZhciBwcm94eVBhcmFtczogby5GblBhcmFtW10gPSBbXTtcbiAgICB2YXIgcHJveHlSZXR1cm5FbnRyaWVzOiBBcnJheTxBcnJheTxzdHJpbmcgfCBvLkV4cHJlc3Npb24+PiA9IFtdO1xuICAgIHZhciB2YWx1ZXM6IG8uRXhwcmVzc2lvbltdID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgcGFyYW1OYW1lID0gYHAke2l9YDtcbiAgICAgIHByb3h5UGFyYW1zLnB1c2gobmV3IG8uRm5QYXJhbShwYXJhbU5hbWUpKTtcbiAgICAgIHByb3h5UmV0dXJuRW50cmllcy5wdXNoKFtlbnRyaWVzW2ldWzBdLCBvLnZhcmlhYmxlKHBhcmFtTmFtZSldKTtcbiAgICAgIHZhbHVlcy5wdXNoKDxvLkV4cHJlc3Npb24+ZW50cmllc1tpXVsxXSk7XG4gICAgfVxuICAgIGNyZWF0ZVB1cmVQcm94eShvLmZuKHByb3h5UGFyYW1zLCBbbmV3IG8uUmV0dXJuU3RhdGVtZW50KG8ubGl0ZXJhbE1hcChwcm94eVJldHVybkVudHJpZXMpKV0pLFxuICAgICAgICAgICAgICAgICAgICBlbnRyaWVzLmxlbmd0aCwgcHJveHlFeHByLCB0aGlzKTtcbiAgICByZXR1cm4gcHJveHlFeHByLmNhbGxGbih2YWx1ZXMpO1xuICB9XG5cbiAgYWZ0ZXJOb2RlcygpIHtcbiAgICB0aGlzLnBpcGVzLmZvckVhY2goKHBpcGUpID0+IHBpcGUuY3JlYXRlKCkpO1xuICAgIHRoaXMudmlld1F1ZXJpZXMudmFsdWVzKCkuZm9yRWFjaChcbiAgICAgICAgKHF1ZXJpZXMpID0+IHF1ZXJpZXMuZm9yRWFjaCgocXVlcnkpID0+IHF1ZXJ5LmFmdGVyQ2hpbGRyZW4odGhpcy51cGRhdGVWaWV3UXVlcmllc01ldGhvZCkpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRWaWV3VHlwZShjb21wb25lbnQ6IENvbXBpbGVEaXJlY3RpdmVNZXRhZGF0YSwgZW1iZWRkZWRUZW1wbGF0ZUluZGV4OiBudW1iZXIpOiBWaWV3VHlwZSB7XG4gIGlmIChlbWJlZGRlZFRlbXBsYXRlSW5kZXggPiAwKSB7XG4gICAgcmV0dXJuIFZpZXdUeXBlLkVNQkVEREVEO1xuICB9IGVsc2UgaWYgKGNvbXBvbmVudC50eXBlLmlzSG9zdCkge1xuICAgIHJldHVybiBWaWV3VHlwZS5IT1NUO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBWaWV3VHlwZS5DT01QT05FTlQ7XG4gIH1cbn1cbiJdfQ==