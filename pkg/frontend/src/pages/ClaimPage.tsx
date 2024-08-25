import {Alert, Box, Grid, IconButton, LinearProgress, Paper, Typography} from "@mui/material";
import {NavigateFunction, useNavigate, useParams} from "react-router-dom";
import {Claim, ClaimExtended, ManagedResourceExtended} from "../types.ts";
import {useEffect, useState} from "react";
import {Node} from "reactflow";
import apiClient from "../api.ts";
import ConditionList from "../components/ConditionList.tsx";
import Events from "../components/Events.tsx";
import RelationsGraph from "../components/graph/RelationsGraph.tsx";
import HeaderBar from "../components/HeaderBar.tsx";
import PageBody from "../components/PageBody.tsx";
import InfoTabs, {ItemContext} from "../components/InfoTabs.tsx";
import ConditionChips from "../components/ConditionChips.tsx";
import InfoDrawer from "../components/InfoDrawer.tsx";
import {DataObject as YAMLIcon} from '@mui/icons-material';
import {GraphData, NodeTypes} from "../components/graph/data.ts";

export default function ClaimPage() {
    const {group: group, version: version, kind: kind, namespace: namespace, name: name} = useParams();
    const [claim, setClaim] = useState<ClaimExtended | null>(null);
    const [error, setError] = useState<object | null>(null);
    const navigate = useNavigate();
    const [isDrawerOpen, setDrawerOpen] = useState<boolean>(false);

    useEffect(() => {
        apiClient.getClaim(group, version, kind, namespace, name)
            .then((data) => setClaim(data))
            .catch((err) => setError(err))
    }, [group, version, kind, namespace, name])

    if (error) {
        return (<Alert severity="error">Failed: {error.toString()}</Alert>)
    }

    if (!claim) {
        return (<LinearProgress/>)
    }

    console.log(claim)
    const data = graphDataFromClaim(claim, navigate);

    const onClose = () => {
        setDrawerOpen(false)
    }

    const claimClean: Claim = {...claim};
    delete claimClean['managedResources']
    delete claimClean['compositeResource']
    delete claimClean['composition']

    const bridge = new ItemContext()
    bridge.setCurrent(claimClean)

    const title = (<>
        {claim.metadata.name}
        <ConditionChips status={claim.status ? claim.status : {}}></ConditionChips>
    </>)

    const onYaml = () => {
        setDrawerOpen(true)
    }

    return (
        <>
            <HeaderBar title={claim.metadata.name} super="Claim"/>
            <PageBody>
                <Grid container spacing={2} alignItems="stretch">
                    <Grid item xs={12} md={6}>
                        <Paper className="p-4">
                            <Box className="flex justify-between">
                                <Typography variant="h6">Configuration</Typography>
                                <IconButton onClick={onYaml} title="Show YAML">
                                    <YAMLIcon/>
                                </IconButton>
                            </Box>
                            <Typography variant="body1">
                                API Version: {claim.apiVersion}
                            </Typography>
                            <Typography variant="body1">
                                Kind: {claim.kind}
                            </Typography>
                            <Typography variant="body1">
                                Namespace: {claim.metadata.namespace}
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Paper className="p-4">
                            <Typography variant="h6">Status</Typography>
                            <ConditionList conditions={claim.status?.conditions}></ConditionList>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={12}>
                        <Paper className="p-4 flex flex-col" sx={{height: '40rem'}}>
                            <Typography variant="h6">Relations</Typography>
                            <RelationsGraph nodes={data.nodes} edges={data.edges}></RelationsGraph>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={12}>
                        <Paper className="p-4">
                            <Typography variant="h6">Events</Typography>
                            <Events src={"providers/" + claim.metadata.name}></Events>
                        </Paper>
                    </Grid>
                </Grid>
            </PageBody>
            <InfoDrawer isOpen={isDrawerOpen} onClose={onClose} type="Claim" title={title}>
                <InfoTabs bridge={bridge} initial="yaml" noRelations={true} noEvents={true} noStatus={true}></InfoTabs>
            </InfoDrawer>
        </>
    );
}


function graphDataFromClaim(claim: ClaimExtended, navigate: NavigateFunction): GraphData {
    const graphData = new GraphData()

    const claimId = graphData.addNode(NodeTypes.Claim, claim, true, navigate)

    // We don't need the compositions for now
    // const compId = graphData.addNode(NodeTypes.Composition, claim.composition, false, navigate);
    // graphData.addEdge(claimId, compId)

    const xrId = graphData.addNode(NodeTypes.CompositeResource, claim.compositeResource, false, navigate);
    graphData.addEdge(claimId, xrId)

    // TODO: check that composite resource points to the same composition and draw line between them

    // Each composite object (xr) has a list of resources (managed and composite resources)
    // stored within managedResources fields
    claim.compositeResource.managedResources?.map(res => {
        // Draw recursively
        // To identidy the type we need to check external-name annotation
        // if it's present, it's a managed resource
        let resType: NodeTypes;
        if (res.metadata.annotations && res.metadata.annotations['crossplane.io/external-name']) {
            resType = NodeTypes.ManagedResource;
        } else {
            resType = NodeTypes.CompositeResource;
        }
        const resId = graphData.addNode(resType, res, false, navigate);
        graphData.addEdge(xrId, resId)

        graphDataFromComposition(graphData, res, resId, navigate)
    })

    return graphData;
}


function graphDataFromComposition(graphData: GraphData, mngRes: ManagedResourceExtended, mngResId: Node, navigate: NavigateFunction) {
    mngRes.managedResources?.map((res: ManagedResourceExtended) => {
        const resId = graphData.addNode(NodeTypes.ManagedResource, res, false, navigate);
        graphData.addEdge(mngResId, resId)
        // Recursively draw the graph
        graphDataFromComposition(graphData, res, resId, navigate)
    })
}