import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoIcon from '@mui/icons-material/Info';
import {Card, Chip, CardContent, Grid, Accordion, AccordionSummary, AccordionDetails, List, Button, Box, Alert} from '@mui/material';
import {CompositeResource, CompositeResourceExtended, ItemList, K8sReference, K8sResource} from "../types.ts";
import Typography from "@mui/material/Typography";
import ReadySynced from "./ReadySynced.tsx";
import {useState} from "react";
import InfoTabs, {ItemContext} from "./InfoTabs.tsx";
import ConditionChips from "./ConditionChips.tsx";
import InfoDrawer from "./InfoDrawer.tsx";
import {NavigateFunction, useNavigate, useParams} from "react-router-dom";
import {GraphData, NodeTypes} from "./graph/data.ts";
import apiClient from "../api.ts";
import {logger} from "../logger.ts";

type ItemProps = {
    item: CompositeResource;
    onItemClick: { (item: CompositeResource): void }
};

function ListItem({item, onItemClick}: ItemProps) {
    const copyToClipboard = (name: string) => {
        navigator.clipboard.writeText(name).then(() => {}, (err) => {
            console.error('Could not copy text: ', err);
        });
    };
    return (
        <Grid item m={1} xs={12} md={12} key={item.apiVersion + item.kind + item.metadata.name}>
            <Card variant="outlined">
                <CardContent>
                    <Box sx={{display: 'flex', flexDirection: 'row', p: 0, m: 0}}>
                        <Typography variant="h6">{item.metadata.name}</Typography>
                        <Chip sx={{ p: 0, mt: 0.5, ml: 1, '& > *': {ml: '8px !important', mr: '-8px !important',}, }}
                            icon={<ContentCopyIcon />} size="small" variant="outlined" color="secondary"
                            onClick={() => copyToClipboard(item.kind + " " + item.metadata.name)} />
                    </Box>
                    <Typography variant="body1">Kind: {item.kind}</Typography>
                    <Typography variant="body1">Group: {item.apiVersion}</Typography>
                    <Typography variant="body1">Composition: {item.spec.compositionRef?.name}</Typography>
                    <Typography variant="body1">Composed resources: {item.spec.resourceRefs?.length}</Typography>
                    <ReadySynced status={item.status ? item.status : {}}></ReadySynced>
                    <Chip icon={<InfoIcon />} label="Details" variant="outlined" color="info" onClick={() => onItemClick(item)} />
                </CardContent>
            </Card>
        </Grid>
    );
}

type ItemListProps = {
    items: ItemList<CompositeResource> | undefined;
};

export default function CompositeResourcesList({items}: ItemListProps) {
    const {name: focusedName} = useParams();
    const [isDrawerOpen, setDrawerOpen] = useState<boolean>(focusedName != undefined);
    const [focused, setFocused] = useState<K8sResource>({metadata: {name: ""}, kind: "", apiVersion: ""});
    const navigate = useNavigate();

    const onClose = () => {
        setDrawerOpen(false)
        navigate("/managed", {state: focused})
    }

    const onItemClick = (item: K8sResource) => {
        setFocused(item)
        setDrawerOpen(true)
        navigate(
            "./" + item.apiVersion + "/" + item.kind + "/" + item.metadata.name,
            {state: item}
        );
    }

    if (!focused.metadata.name && focusedName) {
        items?.items?.forEach((item) => {
            if (focusedName == item.metadata.name) {
                setFocused(item)
            }
        })
    }

    const bridge = new ItemContext()
    bridge.setCurrent(focused)
    bridge.getGraph = (setter, setError) => {
        const setData = (res: CompositeResourceExtended) => {
            logger.log("recv from API", res)
            const data = xrToGraph(res, navigate)
            logger.log("set graph data", data.nodes)
            setter(data)
        }

        const [group, version] = focused.apiVersion.split("/")
        apiClient.getCompositeResource(group, version, focused.kind, focused.metadata.name)
            .then((data) => setData(data))
            .catch((err) => setError(err))
    }

    const title = (<>
        {focused.metadata.name}
        <ConditionChips status={focused.status ? focused.status : {}}></ConditionChips>
    </>)

    if (!items || !items.items.length) {
        return (
            <Typography variant="h6">No items</Typography>
        )
    }

    // Define groupedItems
    const groupedItems: { [kind: string]: CompositeResource[] } = {};
    items.items.forEach((item) => {
        if (!groupedItems[item.kind]) {
            groupedItems[item.kind] = [];
        }
        groupedItems[item.kind].push(item);
    });

    const collapseAll = () => {
        setExpandedItems({});
    };

    const expandAll = () => {
        const expandedState = Object.keys(groupedItems).reduce((acc: Record<string, boolean>, kind: string) => {
          acc[kind] = true;
          return acc;
        }, {});
        setExpandedItems(expandedState);
      };
    const [expandedItems, setExpandedItems] = useState<{[kind: string]: boolean}>({});
    const handleAccordionChange = (kind: string) => {
        setExpandedItems((prevState) => ({
          ...prevState,
          [kind]: !prevState[kind],
        }));
      };
    
    return (
        <>
            <div className="m-2">
                <span className="mx-1"><Button variant="outlined" onClick={expandAll}>Expand All</Button></span>
                <span className="mx-1"><Button variant="outlined" onClick={collapseAll}>Collapse All</Button></span>
            </div>
            {Object.entries(groupedItems).map(([kind, items]) => (
                <Grid item xs={12} md={12} key={kind} m={1}>
                    <Accordion key={kind} expanded={expandedItems[kind] || false} onChange={() => handleAccordionChange(kind)}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                        <Typography variant="h6">{kind}</Typography>
                        <Box sx={{mx: 0.5}}>
                            <Alert sx={{py: 0, 
                                    '& > *': {
                                        py: '4px !important',
                                    },}} 
                                severity="success">
                                Ready: {items.filter((item) => item.status?.conditions?.find((condition) => 
                                    condition.status === "True" && condition.type === "Ready")).length}
                            </Alert>
                        </Box>
                        {
                        items.filter((item) => !item.status?.conditions?.find((condition) =>
                            condition.status === "True" && condition.type === "Ready")).length > 0 ? (
                            <Box sx={{mx: 0.5}}>
                                <Alert sx={{py: 0, 
                                        '& > *': {
                                            py: '4px !important', 
                                        },}} 
                                    severity="error" color="warning">
                                    Not Ready: {items.filter((item) => !item.status?.conditions?.find((condition) =>
                                        condition.status === "True" && condition.type === "Ready")).length}
                                </Alert>
                            </Box>
                            ) : null
                        }
                        
                    </AccordionSummary>
                    <AccordionDetails>
                        <List>
                            {items.map((item: CompositeResource) => (
                                <ListItem item={item} key={item.metadata.name} onItemClick={onItemClick}/>
                            ))}
                        </List>
                    </AccordionDetails>
                    </Accordion>
                </Grid>
            ))}
            <InfoDrawer
                key={focused.metadata.name}
                isOpen={isDrawerOpen}
                onClose={onClose}
                type="Composite Resource"
                title={title}>
                    <InfoTabs bridge={bridge} initial="relations"></InfoTabs>
            </InfoDrawer>
        </>
    );
}

function xrToGraph(res: CompositeResourceExtended, navigate: NavigateFunction): GraphData {
    const data = new GraphData()
    const xr = data.addNode(NodeTypes.CompositeResource, res, true, navigate)

    if (res.claim) {
        const claim = data.addNode(NodeTypes.Claim, res.claim, false, navigate);
        data.addEdge(xr, claim)
    }

    if (res.parentXR) {
        const parentXR = data.addNode(NodeTypes.CompositeResource, res.parentXR, false, navigate);
        data.addEdge(xr, parentXR)
    }

    const composition = data.addNode(NodeTypes.Composition, res.composition, false, navigate);
    data.addEdge(composition, xr)

    res.managedResources?.map(resource => {
        let resId;

        if (res.managedResourcesXRs.some(ref => xrMatch(ref, resource))) {
            resId = data.addNode(NodeTypes.CompositeResource, resource, false, navigate);
        } else if (res.managedResourcesClaims.some(ref => claimMatch(ref, resource))) {
            // TODO: possibly never happens?
            resId = data.addNode(NodeTypes.Claim, resource, false, navigate);
        } else {
            resId = data.addNode(NodeTypes.ManagedResource, resource, false, navigate);
        }
        data.addEdge(resId, xr)
    })

    return data
}

function xrMatch(ref: K8sReference, resource: K8sResource) {
    return ref.kind == resource.kind && ref.apiVersion == resource.apiVersion && ref.name == resource.metadata.name
}

function claimMatch(ref: K8sReference, resource: K8sResource) {
    return xrMatch(ref, resource) && ref.namespace == resource.metadata.namespace;
}
